import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) }));
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
});
