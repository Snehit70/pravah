/**
 * useKairoChats
 *
 * State + persistence for the Kairo chat history. Tracks the chat index in
 * memory and writes through to AsyncStorage with a short debounce so rapid
 * message appends don't thrash the disk.
 *
 * Save model:
 *   - The index is rewritten any time chat metadata changes (create, switch,
 *     delete, rename, title-derivation).
 *   - The active chat's messages are debounce-saved on edit. We also flush
 *     synchronously on chat switch so unsaved edits land before we swap.
 *
 * Hydration model:
 *   - On mount we load the index, then the active chat (or seed a fresh one
 *     with [GREETING] if no chats exist yet).
 *   - `isHydrated` flips true only after the active chat resolves so the UI
 *     can defer message rendering until the real history is in hand and we
 *     don't briefly flash the greeting over a real conversation.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { KairoMessage } from "../lib/kairoApi";
import {
  type ChatMeta,
  type StoredChat,
  deriveChatTitle,
  deleteChat as deleteChatBlob,
  loadChat,
  loadChatIndex,
  makeChatId,
  pruneOldChats,
  saveChat,
  saveChatIndex,
} from "../lib/kairoChatStorage";

const SAVE_DEBOUNCE_MS = 500;

export const KAIRO_GREETING: KairoMessage = {
  from: "kairo",
  text: "Hey, I'm Kairo. I can help you plan your week, prioritize tasks, or analyze your schedule. What do you need?",
};

function makeFreshChat(): StoredChat {
  const now = Date.now();
  return {
    id: makeChatId(),
    title: "New chat",
    createdAt: now,
    updatedAt: now,
    messages: [KAIRO_GREETING],
  };
}

export type UseKairoChats = {
  chats: ChatMeta[];
  activeChat: StoredChat | null;
  isHydrated: boolean;
  createChat: () => void;
  switchChat: (id: string) => void;
  deleteChat: (id: string) => void;
  setMessages: (updater: (prev: KairoMessage[]) => KairoMessage[]) => void;
  appendMessage: (msg: KairoMessage) => void;
};

export function useKairoChats(): UseKairoChats {
  const [chats, setChats] = useState<ChatMeta[]>([]);
  const [activeChat, setActiveChat] = useState<StoredChat | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  // Open the save gate only after hydration completes or the user has made
  // an explicit edit. Mirrors the GoalsScreen approach: a failed load must
  // never silently overwrite stored data with the in-memory fallback. Held
  // as a ref so user-interaction handlers can flip it and have downstream
  // writes in the same tick observe the new value.
  const canSaveRef = useRef(false);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the chat being saved so the debounced flush always writes the
  // latest content for the chat that was active when the timer fires.
  const pendingChatRef = useRef<StoredChat | null>(null);
  // Flips once the user takes any action (create/switch/delete/edit). Mount-
  // time hydration must bail out if it resolves after a local edit, otherwise
  // a slow storage read would clobber the in-memory session.
  const userTouchedRef = useRef(false);
  // The id of the chat the user most recently asked to switch to. Lets us
  // discard stale `loadChat` results from earlier `switchChat` calls so a
  // slow read can't overwrite a newer selection.
  const latestSwitchRef = useRef<string | null>(null);

  // Mark the user as having interacted and ensure the save gate is open.
  // The gate was originally closed only when a load failed, but the user's
  // explicit edits should always become the source of truth — otherwise an
  // unrecoverable read leaves the whole session in memory-only mode and
  // every message they type is lost on next launch.
  const markUserTouched = useCallback(() => {
    userTouchedRef.current = true;
    canSaveRef.current = true;
  }, []);

  const flushPendingSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pendingChatRef.current) {
      void saveChat(pendingChatRef.current);
      pendingChatRef.current = null;
    }
  }, []);

  const scheduleSave = useCallback(
    (chat: StoredChat) => {
      pendingChatRef.current = chat;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (pendingChatRef.current) {
          void saveChat(pendingChatRef.current);
          pendingChatRef.current = null;
        }
        saveTimerRef.current = null;
      }, SAVE_DEBOUNCE_MS);
    },
    []
  );

  // Hydrate once on mount.
  useEffect(() => {
    let cancelled = false;
    // Treat user interaction as a hard cancel: once the user has done
    // anything, the in-memory state is the source of truth and any pending
    // hydration result is discarded.
    const isStale = () => cancelled || userTouchedRef.current;
    void (async () => {
      const indexResult = await loadChatIndex();
      if (isStale()) return;
      if (indexResult.kind === "error") {
        // Load failed. Show a fresh chat in memory but do NOT open the save
        // gate yet — a write here could clobber recoverable storage.
        setActiveChat(makeFreshChat());
        setIsHydrated(true);
        return;
      }

      const { chats: storedChats, activeChatId } = indexResult.index;

      // Empty store → seed one chat so the UI has something to show.
      if (storedChats.length === 0) {
        const fresh = makeFreshChat();
        setChats([{ id: fresh.id, title: fresh.title, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt }]);
        setActiveChat(fresh);
        setIsHydrated(true);
        canSaveRef.current = true;
        // Persist the seed so the next launch finds it.
        void saveChatIndex({
          chats: [{ id: fresh.id, title: fresh.title, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt }],
          activeChatId: fresh.id,
        });
        void saveChat(fresh);
        return;
      }

      const targetId = activeChatId ?? storedChats[0].id;
      const chatResult = await loadChat(targetId);
      if (isStale()) return;

      if (chatResult.kind === "ok") {
        setChats(storedChats);
        setActiveChat(chatResult.chat);
        setIsHydrated(true);
        canSaveRef.current = true;
        return;
      }

      // Index pointed at a chat we couldn't load (missing blob or read
      // error). Drop that entry from the index and try the next one, or
      // seed a fresh chat if nothing else is available.
      const remaining = storedChats.filter((c) => c.id !== targetId);
      if (remaining.length === 0) {
        const fresh = makeFreshChat();
        setChats([{ id: fresh.id, title: fresh.title, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt }]);
        setActiveChat(fresh);
        setIsHydrated(true);
        canSaveRef.current = true;
        void saveChatIndex({
          chats: [{ id: fresh.id, title: fresh.title, createdAt: fresh.createdAt, updatedAt: fresh.updatedAt }],
          activeChatId: fresh.id,
        });
        void saveChat(fresh);
        return;
      }

      const fallback = await loadChat(remaining[0].id);
      if (isStale()) return;
      if (fallback.kind === "ok") {
        setChats(remaining);
        setActiveChat(fallback.chat);
        setIsHydrated(true);
        canSaveRef.current = true;
        void saveChatIndex({ chats: remaining, activeChatId: fallback.chat.id });
        return;
      }

      // Cascade failed. Show a fresh chat, leave save gate closed.
      setChats(remaining);
      setActiveChat(makeFreshChat());
      setIsHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flush on unmount so an in-flight debounce doesn't drop the last edit.
  useEffect(() => {
    return () => {
      flushPendingSave();
    };
  }, [flushPendingSave]);

  const persistIndex = useCallback(
    (nextChats: ChatMeta[], nextActiveId: string | null) => {
      if (!canSaveRef.current) return;
      void saveChatIndex({ chats: nextChats, activeChatId: nextActiveId });
    },
    []
  );

  const createChat = useCallback(() => {
    markUserTouched();
    flushPendingSave();
    const fresh = makeFreshChat();
    const meta: ChatMeta = {
      id: fresh.id,
      title: fresh.title,
      createdAt: fresh.createdAt,
      updatedAt: fresh.updatedAt,
    };
    setChats((prev) => {
      const { kept, removed } = pruneOldChats([meta, ...prev]);
      for (const id of removed) void deleteChatBlob(id);
      persistIndex(kept, fresh.id);
      return kept;
    });
    setActiveChat(fresh);
    void saveChat(fresh);
  }, [flushPendingSave, markUserTouched, persistIndex]);

  const switchChat = useCallback(
    (id: string) => {
      if (activeChat?.id === id) return;
      markUserTouched();
      flushPendingSave();
      latestSwitchRef.current = id;
      void (async () => {
        const result = await loadChat(id);
        // Discard if the user has since tapped a different chat — otherwise
        // a slow read could clobber the newer selection.
        if (latestSwitchRef.current !== id) return;
        if (result.kind === "ok") {
          setActiveChat(result.chat);
          setChats((prev) => {
            persistIndex(prev, id);
            return prev;
          });
        }
      })();
    },
    [activeChat?.id, flushPendingSave, markUserTouched, persistIndex]
  );

  const deleteChatById = useCallback(
    (id: string) => {
      markUserTouched();
      flushPendingSave();
      void deleteChatBlob(id);
      setChats((prev) => {
        const next = prev.filter((c) => c.id !== id);
        // If we deleted the active chat, switch to the most recent remaining
        // chat, or seed a fresh one if none left.
        if (activeChat?.id === id) {
          if (next.length === 0) {
            const fresh = makeFreshChat();
            const meta: ChatMeta = {
              id: fresh.id,
              title: fresh.title,
              createdAt: fresh.createdAt,
              updatedAt: fresh.updatedAt,
            };
            setActiveChat(fresh);
            persistIndex([meta], fresh.id);
            if (canSaveRef.current) void saveChat(fresh);
            return [meta];
          }
          const sorted = [...next].sort((a, b) => b.updatedAt - a.updatedAt);
          const target = sorted[0];
          // Synchronously detach the deleted chat so the UI can't keep
          // dispatching messages against it while loadChat resolves. We
          // re-render with the real chat once the async read returns.
          setActiveChat(null);
          latestSwitchRef.current = target.id;
          void (async () => {
            const result = await loadChat(target.id);
            if (latestSwitchRef.current !== target.id) return;
            if (result.kind === "ok") setActiveChat(result.chat);
          })();
          persistIndex(next, target.id);
          return next;
        }
        persistIndex(next, activeChat?.id ?? null);
        return next;
      });
    },
    [activeChat?.id, flushPendingSave, markUserTouched, persistIndex]
  );

  const applyMessageUpdate = useCallback(
    (updater: (prev: KairoMessage[]) => KairoMessage[]) => {
      markUserTouched();
      setActiveChat((prev) => {
        if (!prev) return prev;
        const nextMessages = updater(prev.messages);
        if (nextMessages === prev.messages) return prev;
        const now = Date.now();
        // Auto-title from the first user message. We only re-derive while the
        // chat is still on its default title to avoid clobbering a future
        // user-supplied rename.
        const nextTitle =
          prev.title === "New chat" ? deriveChatTitle(nextMessages) : prev.title;
        const nextChat: StoredChat = {
          ...prev,
          title: nextTitle,
          updatedAt: now,
          messages: nextMessages,
        };
        if (canSaveRef.current) scheduleSave(nextChat);
        // Mirror title + updatedAt into the index so the chat list reorders.
        setChats((current) => {
          const next = current.map((c) =>
            c.id === nextChat.id ? { ...c, title: nextTitle, updatedAt: now } : c
          );
          persistIndex(next, nextChat.id);
          return next;
        });
        return nextChat;
      });
    },
    [markUserTouched, persistIndex, scheduleSave]
  );

  const appendMessage = useCallback(
    (msg: KairoMessage) => {
      applyMessageUpdate((prev) => [...prev, msg]);
    },
    [applyMessageUpdate]
  );

  return {
    chats,
    activeChat,
    isHydrated,
    createChat,
    switchChat,
    deleteChat: deleteChatById,
    setMessages: applyMessageUpdate,
    appendMessage,
  };
}
