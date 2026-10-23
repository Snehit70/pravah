import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  getItem: vi.fn(async (): Promise<string | null> => null),
  setItem: vi.fn<(key: string, value: string) => Promise<void>>(async () => undefined),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({ default: storage }));
vi.mock("react-native", () => ({ AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) } }));

describe("diagnostic persistence", () => {
  beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers(); });
  afterEach(() => vi.useRealTimers());
  it("skips clean timer ticks and writes newly recorded events", async () => {
    const diagnostics = await import("../lib/diagnostics");
    await diagnostics.initializeDiagnostics();
    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(25000);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    diagnostics.recordDiagnosticEvent("new-event", "info");
    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    await diagnostics.shutdownDiagnostics();
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });

  it("expires persisted history even when no new events arrive", async () => {
    const legacyTimestamp = Date.now() - 14 * 24 * 60 * 60 * 1000 + 15_000;
    storage.getItem.mockResolvedValueOnce(JSON.stringify({ sessions: [{
      sessionId: "previous", startedAt: legacyTimestamp,
      events: [{ ts: legacyTimestamp, sessionId: "previous", seq: 1, event: "legacy", level: "info", screen: "inbox", flow: "ui" }],
    }] }));
    const diagnostics = await import("../lib/diagnostics");
    await diagnostics.initializeDiagnostics();
    await vi.advanceTimersByTimeAsync(5000);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem.mock.calls[0]?.[1]).toContain("legacy");
    await vi.advanceTimersByTimeAsync(15_000);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
    expect(storage.setItem.mock.calls[1]?.[1]).not.toContain("legacy");
    await diagnostics.shutdownDiagnostics();
  });
});
