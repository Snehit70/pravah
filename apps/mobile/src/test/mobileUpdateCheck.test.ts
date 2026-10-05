import { describe, expect, it, vi } from "vitest";
import {
  createMobileUpdateCheck,
  otaStatusCopy,
} from "../lib/mobileUpdateCheck";
import { manifestReleaseVersion } from "../lib/mobileReleaseState";
import {
  imageTransferTrace,
  providerFailureCategory,
} from "../lib/taskImageUploadDiagnostics";

describe("OTA checks", () => {
  it.each([
    "noUpdateAvailableOnServer",
    "updateRejectedBySelectionPolicy",
    "updatePreviouslyFailed",
    "rollbackRejectedBySelectionPolicy",
    "rollbackNoEmbeddedConfiguration",
  ])("preserves the SDK reason %s", async (reason) => {
    const checks = createMobileUpdateCheck({
      isEnabled: true,
      check: async () => ({ isAvailable: false, reason }),
      fetch: vi.fn(),
      record: vi.fn(),
    });
    await checks.check();
    expect(checks.snapshot()).toEqual({ status: "unavailable", reason });
    expect(otaStatusCopy(checks.snapshot(), false)).not.toBe(
      "You're up to date.",
    );
  });
  it("deduplicates consumers and allows a failed check to retry", async () => {
    const check = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ isAvailable: true });
    const fetch = vi.fn(async () => undefined);
    const checks = createMobileUpdateCheck({
      isEnabled: true,
      check,
      fetch,
      record: vi.fn(),
    });
    const a = checks.check();
    expect(checks.check()).toBe(a);
    await a;
    expect(checks.snapshot()).toEqual({
      status: "failed",
      reason: "check_failed",
    });
    await checks.check();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(checks.snapshot().status).toBe("downloaded");
  });
  it("distinguishes a download failure and never reports completion", async () => {
    const checks = createMobileUpdateCheck({
      isEnabled: true,
      check: async () => ({ isAvailable: true }),
      fetch: async () => {
        throw new Error("asset denied");
      },
      record: vi.fn(),
    });
    await checks.check();
    expect(checks.snapshot()).toEqual({
      status: "failed",
      reason: "download_failed",
    });
  });
  it("uses the actual downloaded manifest and tolerates missing identity", () => {
    expect(
      manifestReleaseVersion({
        extra: { expoClient: { extra: { mobileReleaseVersion: "3.0.24" } } },
      }),
    ).toBe("3.0.24");
    expect(
      manifestReleaseVersion({ extra: { expoClient: { version: "3.0.23" } } }),
    ).toBe("3.0.23");
    expect(manifestReleaseVersion({ extra: {} })).toBeNull();
  });
});

describe("image diagnostics", () => {
  it("keeps correlation stable without exporting the raw identifier", () => {
    expect(imageTransferTrace("upl_private")).toBe(
      imageTransferTrace("upl_private"),
    );
    expect(imageTransferTrace("upl_private")).not.toContain("upl_private");
  });
  it.each([
    [400, "Invalid Signature secret", "provider_signature"],
    [429, "rate limit", "provider_rate_limit"],
    [500, "private data", "provider_unavailable"],
    [400, "already exists", "provider_duplicate"],
  ])(
    "classifies %s without retaining provider text",
    (status, message, expected) => {
      expect(
        providerFailureCategory(
          Number(status),
          JSON.stringify({ error: { message } }),
        ),
      ).toBe(expected);
    },
  );
});
