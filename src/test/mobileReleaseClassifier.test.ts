import { describe, expect, it } from "vitest";

import { classifyMobileRelease } from "../../scripts/mobile-release/classifier";

describe("mobile release classification", () => {
  it("requires a native release for local Expo module changes even if fingerprints match", () => {
    const path = "apps/mobile/modules/pravah-image-input/android/src/main/java/PravahImageInputModule.kt";
    const result = classifyMobileRelease({
      changedFiles: [path], labels: ["mobile-ota"],
      sourceFingerprint: "same", supportedFingerprint: "same",
      pullRequestBody: "## Mobile release notes\n\nKeyboard image paste.",
    });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(`OTA includes native-critical paths: ${path}`);
  });

  it("requires exactly one classification for shipped mobile changes", () => {
    const result = classifyMobileRelease({
      changedFiles: ["apps/mobile/src/components/TaskCard.tsx"],
      labels: [],
      sourceFingerprint: "fingerprint-1",
      supportedFingerprint: "fingerprint-1",
      pullRequestBody: "## Mobile release notes\n\nCapture is faster.",
    });

    expect(result).toEqual({
      ok: false,
      classification: null,
      reasons: ["Mobile-affecting pull requests require exactly one release classification"],
    });
  });

  it("does not require a mobile classification for CLI-only HTTP adapter changes", () => {
    expect(
      classifyMobileRelease({
        changedFiles: [
          "packages/cli/src/commands.ts",
          "convex/http.ts",
          "convex/automationHttpAuth.ts",
        ],
        labels: [],
      }),
    ).toEqual({ ok: true, classification: null, reasons: [] });
  });

  it("blocks OTA publication when the release source does not match the supported runtime", () => {
    const result = classifyMobileRelease({
      changedFiles: ["apps/mobile/src/components/TaskCard.tsx"],
      labels: ["mobile-ota"],
      sourceFingerprint: "fingerprint-2",
      supportedFingerprint: "fingerprint-1",
      pullRequestBody: "## Mobile release notes\n\nCapture is faster.",
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

  it("requires OTA release notes", () => {
    const result = classifyMobileRelease({
      changedFiles: ["apps/mobile/src/components/TaskCard.tsx"],
      labels: ["mobile-ota"],
      sourceFingerprint: "fingerprint-1",
      supportedFingerprint: "fingerprint-1",
      pullRequestBody: "",
    });
    expect(result.reasons).toContain(
      "mobile-ota requires a non-empty Mobile release notes section",
    );
  });

  it("allows the isolated release foundation to bootstrap without shipping", () => {
    expect(
      classifyMobileRelease({
        changedFiles: [
          "convex/mobileReleases.ts",
          "convex/schema.ts",
          "convex/_generated/api.d.ts",
        ],
        labels: ["mobile-no-release"],
      }),
    ).toMatchObject({ ok: true, classification: "mobile-no-release" });
  });

  it("blocks OTA when a build-time app asset changes", () => {
    // The Expo config plugins read these at prebuild time and emit native
    // drawables, so a JS-bundle-only OTA would not deliver them.
    const result = classifyMobileRelease({
      changedFiles: [
        "apps/mobile/src/components/TaskCard.tsx",
        "apps/mobile/assets/notification-icon.png",
      ],
      labels: ["mobile-ota"],
      sourceFingerprint: "fingerprint-1",
      supportedFingerprint: "fingerprint-1",
      pullRequestBody: "## Mobile release notes\n\nBranding refresh.",
    });

    expect(result.ok).toBe(false);
    expect(result.reasons).toContain(
      "OTA includes native-critical paths: apps/mobile/assets/notification-icon.png",
    );
  });

  it("keeps JS-bundled sounds OTA-safe", () => {
    // These are imported in src/lib/sound.ts and travel in the JS bundle.
    const result = classifyMobileRelease({
      changedFiles: [
        "apps/mobile/src/lib/sound.ts",
        "apps/mobile/assets/sounds/pravah-capture.wav",
      ],
      labels: ["mobile-ota"],
      sourceFingerprint: "fingerprint-1",
      supportedFingerprint: "fingerprint-1",
      pullRequestBody: "## Mobile release notes\n\nNew capture chime.",
    });

    expect(result).toMatchObject({ ok: true, classification: "mobile-ota" });
  });

  it("keeps component-bundled icons under src/assets OTA-safe", () => {
    // SVGs imported from JS are transformed into the bundle, unlike the
    // build-time assets in apps/mobile/assets/.
    const result = classifyMobileRelease({
      changedFiles: [
        "apps/mobile/src/components/SettingsSheet.tsx",
        "apps/mobile/src/assets/icons/settings-quiet-hours.svg",
      ],
      labels: ["mobile-ota"],
      sourceFingerprint: "fingerprint-1",
      supportedFingerprint: "fingerprint-1",
      pullRequestBody: "## Mobile release notes\n\nQuieter hours icon.",
    });

    expect(result).toMatchObject({ ok: true, classification: "mobile-ota" });
  });
});
