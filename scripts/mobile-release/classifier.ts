export const MOBILE_RELEASE_CLASSIFICATIONS = [
  "mobile-ota",
  "mobile-native",
  "mobile-no-release",
] as const;

export type MobileReleaseClassification =
  (typeof MOBILE_RELEASE_CLASSIFICATIONS)[number];

export type ClassificationInput = {
  changedFiles: readonly string[];
  labels: readonly string[];
  sourceFingerprint?: string;
  supportedFingerprint?: string;
  fingerprintError?: string;
};

export type ClassificationResult = {
  ok: boolean;
  classification: MobileReleaseClassification | null;
  reasons: string[];
};

const nativeCriticalPaths = [
  "apps/mobile/app.config.ts",
  "apps/mobile/app.json",
  "apps/mobile/package.json",
  "apps/mobile/eas.json",
  "bun.lock",
] as const;

function isMobileAffecting(path: string): boolean {
  return (
    path.startsWith("apps/mobile/") ||
    path.startsWith("convex/") ||
    path === "bun.lock"
  );
}

function isNonShipping(path: string): boolean {
  return (
    path.startsWith("docs/") ||
    path === "CONTEXT.md" ||
    path.startsWith("apps/mobile/docs/") ||
    path.startsWith("apps/mobile/src/test/") ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path) ||
    path.startsWith("scripts/mobile-release/") ||
    path.startsWith(".github/")
  );
}

function isNativeCritical(path: string): boolean {
  return (
    nativeCriticalPaths.includes(
      path as (typeof nativeCriticalPaths)[number],
    ) ||
    path.startsWith("apps/mobile/plugins/") ||
    path.startsWith("apps/mobile/android/") ||
    path.startsWith("apps/mobile/ios/")
  );
}

export function classifyMobileRelease(
  input: ClassificationInput,
): ClassificationResult {
  const changedFiles = [...new Set(input.changedFiles)];
  const affectsMobile = changedFiles.some(isMobileAffecting);
  const classifications = MOBILE_RELEASE_CLASSIFICATIONS.filter((label) =>
    input.labels.includes(label),
  );
  const classification =
    classifications.length === 1 ? classifications[0] : null;
  const reasons: string[] = [];

  if (!affectsMobile) {
    if (classifications.length > 1) {
      reasons.push("Pull requests cannot have multiple mobile release classifications");
    }
    return { ok: reasons.length === 0, classification, reasons };
  }

  if (classifications.length !== 1) {
    reasons.push(
      "Mobile-affecting pull requests require exactly one release classification",
    );
    return { ok: false, classification: null, reasons };
  }

  if (classification === "mobile-no-release") {
    if (changedFiles.some((path) => isMobileAffecting(path) && !isNonShipping(path))) {
      reasons.push(
        "mobile-no-release cannot include shipped mobile or backend behavior",
      );
    }
    return { ok: reasons.length === 0, classification, reasons };
  }

  if (classification === "mobile-ota") {
    if (input.fingerprintError) {
      reasons.push(`Native fingerprint generation failed: ${input.fingerprintError}`);
    } else if (!input.sourceFingerprint || !input.supportedFingerprint) {
      reasons.push("OTA classification requires both native fingerprints");
    } else if (input.sourceFingerprint !== input.supportedFingerprint) {
      reasons.push(
        "Release source fingerprint does not match the supported native runtime",
      );
    }
    const critical = changedFiles.filter(isNativeCritical);
    if (critical.length > 0) {
      reasons.push(`OTA includes native-critical paths: ${critical.join(", ")}`);
    }
  }

  return { ok: reasons.length === 0, classification, reasons };
}
