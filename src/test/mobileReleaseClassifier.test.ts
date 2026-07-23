import { describe, expect, it } from "vitest";

import { classifyMobileRelease } from "../../scripts/mobile-release/classifier";

describe("mobile release classification", () => {
  it("requires exactly one classification for shipped mobile changes", () => {
    const result = classifyMobileRelease({
      changedFiles: ["apps/mobile/src/components/TaskCard.tsx"],
      labels: [],
      sourceFingerprint: "fingerprint-1",
      supportedFingerprint: "fingerprint-1",
    });

    expect(result).toEqual({
      ok: false,
      classification: null,
      reasons: ["Mobile-affecting pull requests require exactly one release classification"],
    });
  });

  it("blocks OTA publication when the release source does not match the supported runtime", () => {
    const result = classifyMobileRelease({
      changedFiles: ["apps/mobile/src/components/TaskCard.tsx"],
      labels: ["mobile-ota"],
      sourceFingerprint: "fingerprint-2",
      supportedFingerprint: "fingerprint-1",
    });

    expect(result).toEqual({
      ok: false,
      classification: "mobile-ota",
      reasons: [
        "Release source fingerprint does not match the supported native runtime",
      ],
    });
  });

  it("allows mobile-no-release only for non-shipping files", () => {
    expect(
      classifyMobileRelease({
        changedFiles: ["apps/mobile/src/test/taskCard.test.tsx"],
        labels: ["mobile-no-release"],
        sourceFingerprint: "fingerprint-1",
        supportedFingerprint: "fingerprint-1",
      }),
    ).toEqual({
      ok: true,
      classification: "mobile-no-release",
      reasons: [],
    });

    expect(
      classifyMobileRelease({
        changedFiles: ["apps/mobile/src/components/TaskCard.tsx"],
        labels: ["mobile-no-release"],
        sourceFingerprint: "fingerprint-1",
        supportedFingerprint: "fingerprint-1",
      }),
    ).toEqual({
      ok: false,
      classification: "mobile-no-release",
      reasons: [
        "mobile-no-release cannot include shipped mobile or backend behavior",
      ],
    });
  });
});
