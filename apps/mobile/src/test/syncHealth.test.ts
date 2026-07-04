import { describe, expect, it } from "vitest";
import { deriveSyncHealth, summarizeSyncError } from "../lib/syncHealth";

describe("summarizeSyncError", () => {
  it("returns undefined when there is no error", () => {
    expect(summarizeSyncError(undefined)).toBeUndefined();
    expect(summarizeSyncError("")).toBeUndefined();
  });

  it("maps the read-limit failure to a friendly, recoverable message", () => {
    const raw =
      "Uncaught Error: Too many documents read in a single function execution (limit: 32000).\n    at handler (../convex/sync.ts:413:53)";
    expect(summarizeSyncError(raw)).toMatch(/too large to finish/i);
  });

  it("strips the Uncaught/Error prefix and the stack frames", () => {
    const raw = "Uncaught Error: Token expired\n    at foo\n    at bar";
    expect(summarizeSyncError(raw)).toBe("Token expired");
  });
});

describe("deriveSyncHealth", () => {
  it("reports error when an unresolved lastError is present, even if 'connected'", () => {
    expect(
      deriveSyncHealth({ status: "connected", syncEnabled: true, hasAccount: true, lastError: "boom" })
    ).toBe("error");
  });

  it("reports paused when the account is linked but sync is disabled", () => {
    expect(
      deriveSyncHealth({ status: "connected", syncEnabled: false, hasAccount: true })
    ).toBe("paused");
  });

  it("does not report error from a stale lastError once sync is disabled or disconnected", () => {
    expect(
      deriveSyncHealth({ status: "connected", syncEnabled: false, hasAccount: true, lastError: "boom" })
    ).toBe("paused");
    expect(
      deriveSyncHealth({ status: "disconnected", syncEnabled: false, hasAccount: false, lastError: "boom" })
    ).toBe("disconnected");
  });

  it("reports disconnected whenever the backend status is disconnected", () => {
    expect(
      deriveSyncHealth({ status: "disconnected", syncEnabled: false, hasAccount: false })
    ).toBe("disconnected");
    expect(
      deriveSyncHealth({ status: "disconnected", syncEnabled: true, hasAccount: true })
    ).toBe("disconnected");
  });

  it("reports healthy when connected, enabled, and error-free", () => {
    expect(
      deriveSyncHealth({ status: "connected", syncEnabled: true, hasAccount: true })
    ).toBe("healthy");
  });
});
