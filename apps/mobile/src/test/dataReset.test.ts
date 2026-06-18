/** @vitest-environment happy-dom */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const getAllKeys = vi.fn();
const multiRemove = vi.fn(async () => undefined);
const deleteItemAsync = vi.fn(async () => undefined);
const cancelAllRemindersAsync = vi.fn(async () => undefined);
const clearKairoConfig = vi.fn(async () => undefined);

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getAllKeys,
    multiRemove,
  },
}));

vi.mock("expo-secure-store", () => ({
  deleteItemAsync,
}));

vi.mock("../lib/syncReminders", () => ({
  cancelAllRemindersAsync,
}));

vi.mock("../lib/kairoConfig", () => ({
  clearKairoConfig,
}));

vi.mock("../lib/logger", () => ({
  classifyError: () => "unknown",
  mobileLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

let wipeLocalAppData: typeof import("../lib/dataReset").wipeLocalAppData;

describe("wipeLocalAppData", () => {
  beforeAll(async () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    ({ wipeLocalAppData } = await import("../lib/dataReset"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    getAllKeys.mockResolvedValue(["pravah_a", "something_else", "pravah_b"]);
  });

  it("cancels reminders before clearing Pravah local storage", async () => {
    const result = await wipeLocalAppData();

    expect(cancelAllRemindersAsync).toHaveBeenCalledTimes(1);
    expect(clearKairoConfig).toHaveBeenCalledTimes(1);
    expect(multiRemove).toHaveBeenCalledWith(["pravah_a", "pravah_b"]);
    expect(deleteItemAsync).toHaveBeenCalledTimes(2);
    expect(cancelAllRemindersAsync.mock.invocationCallOrder[0]).toBeLessThan(
      multiRemove.mock.invocationCallOrder[0],
    );
    expect(result).toEqual({ removedAsync: 2, removedSecure: 2 });
  });
});
