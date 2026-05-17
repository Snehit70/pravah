/**
 * Kairo chat persistence.
 *
 * Two-tier AsyncStorage layout so app launch doesn't have to load every message:
 *   - INDEX_KEY  → small list of chat metadata + active id
 *   - CHAT_KEY_PREFIX + <id> → the messages for one chat
 *
 * Storage is local-only by design (single-user product, no cross-device sync
 * yet). Promotable to Convex later behind the same module surface.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { KairoMessage } from "./kairoApi";
import { classifyError, mobileLogger } from "./logger";

const INDEX_KEY = "pravah_kairo_chats_index_v1";
const CHAT_KEY_PREFIX = "pravah_kairo_chat_v1_";

/** Cap before we prune oldest chats. AsyncStorage on Android tops out near
 *  6MB; 50 chats × 300 messages keeps us comfortably below that. */
export const MAX_CHATS = 50;
export const MAX_MESSAGES_PER_CHAT = 300;

export type ChatMeta = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export type StoredChat = ChatMeta & {
  messages: KairoMessage[];
};

export type ChatIndex = {
  chats: ChatMeta[];
  activeChatId: string | null;
};

export type LoadIndexResult =
  | { kind: "ok"; index: ChatIndex }
  | { kind: "error" };

export type LoadChatResult =
  | { kind: "ok"; chat: StoredChat }
  | { kind: "missing" }
  | { kind: "error" };

function chatKey(id: string): string {
  return `${CHAT_KEY_PREFIX}${id}`;
}

export function makeChatId(): string {
  const maybe = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (maybe?.randomUUID) return maybe.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isChatMeta(value: unknown): value is ChatMeta {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.createdAt === "number" &&
    typeof v.updatedAt === "number"
  );
}

function isKairoMessage(value: unknown): value is KairoMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.from === "me" || v.from === "kairo") &&
    typeof v.text === "string"
  );
}

function sanitizeIndex(value: unknown): ChatIndex {
  if (!value || typeof value !== "object") return { chats: [], activeChatId: null };
  const v = value as Record<string, unknown>;
  const chats = Array.isArray(v.chats) ? v.chats.filter(isChatMeta) : [];
  const activeChatId = typeof v.activeChatId === "string" ? v.activeChatId : null;
  return {
    chats,
    activeChatId: chats.some((c) => c.id === activeChatId) ? activeChatId : null,
  };
}

function sanitizeChat(value: unknown): StoredChat | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (!isChatMeta(v)) return null;
  const rawMessages = (value as { messages?: unknown }).messages;
  const messages = Array.isArray(rawMessages) ? rawMessages.filter(isKairoMessage) : [];
  return { id: v.id, title: v.title, createdAt: v.createdAt, updatedAt: v.updatedAt, messages };
}

export async function loadChatIndex(): Promise<LoadIndexResult> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    if (!raw) return { kind: "ok", index: { chats: [], activeChatId: null } };
    return { kind: "ok", index: sanitizeIndex(JSON.parse(raw)) };
  } catch (error) {
    mobileLogger.warn("kairo_chats_index_load_failed", { errorType: classifyError(error) });
    return { kind: "error" };
  }
}

export async function saveChatIndex(index: ChatIndex): Promise<void> {
  try {
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    mobileLogger.warn("kairo_chats_index_save_failed", { errorType: classifyError(error) });
  }
}

export async function loadChat(id: string): Promise<LoadChatResult> {
  try {
    const raw = await AsyncStorage.getItem(chatKey(id));
    if (!raw) return { kind: "missing" };
    const chat = sanitizeChat(JSON.parse(raw));
    if (!chat) return { kind: "missing" };
    return { kind: "ok", chat };
  } catch (error) {
    mobileLogger.warn("kairo_chat_load_failed", { errorType: classifyError(error) });
    return { kind: "error" };
  }
}

export async function saveChat(chat: StoredChat): Promise<void> {
  try {
    // Trim oldest messages above the cap. Keep the most recent N to preserve
    // the conversation's current thread.
    const trimmed: StoredChat =
      chat.messages.length > MAX_MESSAGES_PER_CHAT
        ? { ...chat, messages: chat.messages.slice(-MAX_MESSAGES_PER_CHAT) }
        : chat;
    await AsyncStorage.setItem(chatKey(chat.id), JSON.stringify(trimmed));
  } catch (error) {
    mobileLogger.warn("kairo_chat_save_failed", { errorType: classifyError(error) });
  }
}

export async function deleteChat(id: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(chatKey(id));
  } catch (error) {
    mobileLogger.warn("kairo_chat_delete_failed", { errorType: classifyError(error) });
  }
}

/** Drop chats beyond MAX_CHATS, oldest by updatedAt. Returns the surviving
 *  meta list and the ids that were removed (caller is responsible for
 *  deleting their message blobs). */
export function pruneOldChats(chats: ChatMeta[]): {
  kept: ChatMeta[];
  removed: string[];
} {
  if (chats.length <= MAX_CHATS) return { kept: chats, removed: [] };
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    kept: sorted.slice(0, MAX_CHATS),
    removed: sorted.slice(MAX_CHATS).map((c) => c.id),
  };
}

/** Auto-title from the first user message. Falls back to "New chat" when no
 *  user content yet exists. */
export function deriveChatTitle(messages: KairoMessage[]): string {
  const firstUser = messages.find((m) => m.from === "me");
  if (!firstUser) return "New chat";
  const words = firstUser.text.trim().split(/\s+/).slice(0, 6);
  if (words.length === 0) return "New chat";
  const joined = words.join(" ");
  return joined.length > 60 ? `${joined.slice(0, 57)}…` : joined;
}
