import { beforeEach, describe, expect, it, vi } from "vitest";

const backing = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) => backing.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      backing.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      backing.delete(key);
    }),
  },
}));

vi.mock("../lib/logger", () => ({
  mobileLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
  classifyError: () => "test",
}));

import {
  MAX_MESSAGES_PER_CHAT,
  deriveChatTitle,
  loadChat,
  loadChatIndex,
  pruneOldChats,
  saveChat,
  saveChatIndex,
  type ChatMeta,
  type StoredChat,
} from "../lib/kairoChatStorage";

beforeEach(() => {
  backing.clear();
});

describe("kairoChatStorage", () => {
  it("returns an empty index when storage is empty", async () => {
    const result = await loadChatIndex();
    expect(result).toEqual({
      kind: "ok",
      index: { chats: [], activeChatId: null },
    });
  });

  it("round-trips an index through save and load", async () => {
    const meta: ChatMeta = {
      id: "chat-1",
      title: "Plan my week",
      createdAt: 1000,
      updatedAt: 2000,
    };
    await saveChatIndex({ chats: [meta], activeChatId: "chat-1" });
    const result = await loadChatIndex();
    expect(result).toEqual({
      kind: "ok",
      index: { chats: [meta], activeChatId: "chat-1" },
    });
  });

  it("drops an activeChatId that does not match any stored chat", async () => {
    const meta: ChatMeta = {
      id: "chat-1",
      title: "T",
      createdAt: 0,
      updatedAt: 1,
    };
    backing.set(
      "pravah_kairo_chats_index_v1",
      JSON.stringify({ chats: [meta], activeChatId: "chat-missing" })
    );
    const result = await loadChatIndex();
    expect(result).toEqual({
      kind: "ok",
      index: { chats: [meta], activeChatId: null },
    });
  });

  it("returns missing when a chat blob is not present", async () => {
    const result = await loadChat("nope");
    expect(result).toEqual({ kind: "missing" });
  });

  it("round-trips a chat through saveChat and loadChat", async () => {
    const chat: StoredChat = {
      id: "chat-1",
      title: "T",
      createdAt: 1,
      updatedAt: 2,
      messages: [
        { from: "kairo", text: "Hi" },
        { from: "me", text: "Hello" },
      ],
    };
    await saveChat(chat);
    const result = await loadChat("chat-1");
    expect(result).toEqual({ kind: "ok", chat });
  });

  it("trims oldest messages above MAX_MESSAGES_PER_CHAT on save", async () => {
    const messages = Array.from({ length: MAX_MESSAGES_PER_CHAT + 10 }, (_, i) => ({
      from: (i % 2 === 0 ? "me" : "kairo") as "me" | "kairo",
      text: `m${i}`,
    }));
    await saveChat({
      id: "chat-1",
      title: "T",
      createdAt: 0,
      updatedAt: 0,
      messages,
    });
    const result = await loadChat("chat-1");
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.chat.messages).toHaveLength(MAX_MESSAGES_PER_CHAT);
    // Trim keeps the most recent N.
    expect(result.chat.messages[0].text).toBe("m10");
    expect(result.chat.messages.at(-1)?.text).toBe(`m${MAX_MESSAGES_PER_CHAT + 9}`);
  });

  it("ignores invalid message entries when reading", async () => {
    backing.set(
      "pravah_kairo_chat_v1_chat-1",
      JSON.stringify({
        id: "chat-1",
        title: "T",
        createdAt: 0,
        updatedAt: 0,
        messages: [
          { from: "me", text: "ok" },
          { from: "bogus", text: "skip" },
          { from: "kairo", text: 42 },
          "garbage",
        ],
      })
    );
    const result = await loadChat("chat-1");
    if (result.kind !== "ok") throw new Error("expected ok");
    expect(result.chat.messages).toEqual([{ from: "me", text: "ok" }]);
  });

  describe("pruneOldChats", () => {
    it("keeps everything when count is at or below the cap", () => {
      const chats: ChatMeta[] = Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        title: `t${i}`,
        createdAt: i,
        updatedAt: i,
      }));
      const result = pruneOldChats(chats);
      expect(result.kept).toHaveLength(10);
      expect(result.removed).toEqual([]);
    });

    it("removes oldest by updatedAt when count exceeds the cap", () => {
      const chats: ChatMeta[] = Array.from({ length: 55 }, (_, i) => ({
        id: `c${i}`,
        title: `t${i}`,
        createdAt: i,
        updatedAt: i,
      }));
      const result = pruneOldChats(chats);
      expect(result.kept).toHaveLength(50);
      expect(result.removed).toHaveLength(5);
      // Oldest 5 (c0..c4) should be the ones removed.
      expect(result.removed.sort()).toEqual(["c0", "c1", "c2", "c3", "c4"]);
    });
  });

  describe("deriveChatTitle", () => {
    it('returns "New chat" when there is no user message', () => {
      expect(deriveChatTitle([{ from: "kairo", text: "Hello" }])).toBe("New chat");
    });

    it("uses the first user message, capped at six words", () => {
      expect(
        deriveChatTitle([
          { from: "kairo", text: "Hi" },
          { from: "me", text: "Plan my week starting next Monday please" },
        ])
      ).toBe("Plan my week starting next Monday");
    });

    it("truncates long single-word titles", () => {
      const long = "a".repeat(80);
      const result = deriveChatTitle([{ from: "me", text: long }]);
      expect(result.length).toBeLessThanOrEqual(60);
      expect(result.endsWith("…")).toBe(true);
    });
  });
});
