import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

import { describeErrorForDiagnostics } from "../lib/logger";

describe("describeErrorForDiagnostics", () => {
  it("preserves Error messages and stacks for crash diagnostics", () => {
    const error = new TypeError("Settings crashed while opening");
    error.stack = "TypeError: Settings crashed while opening\n    at SettingsSheet";

    expect(describeErrorForDiagnostics(error)).toEqual({
      errorName: "TypeError",
      errorMessage: "Settings crashed while opening",
      errorStack: "TypeError: Settings crashed while opening\n    at SettingsSheet",
    });
  });

  it("describes non-Error throws without losing their shape", () => {
    expect(describeErrorForDiagnostics({ code: "E_RENDER", message: "bad render" })).toEqual({
      errorName: "NonErrorThrow",
      errorMessage: "bad render",
      errorStack: undefined,
      thrownValueType: "object",
      thrownValueKeys: ["code", "message"],
    });
  });
});
