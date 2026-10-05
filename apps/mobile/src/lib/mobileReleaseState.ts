export type MobileReleaseControl = {
  latestVersion: string;
  supportedRuntime: string;
  minimumRuntime?: string;
};

export type MobileReleaseState = {
  /** Exact release embedded in the currently running JavaScript bundle. */
  runningVersion: string;
  latestVersion: string;
  pendingVersion: string | null;
  nativeRuntime: string;
  minimumRuntime: string | null;
  needsNativeUpgrade: boolean;
  isBelowMinimumRuntime: boolean;
};

function runtimeNumber(runtime: string): number | null {
  const match = /^native-(\d+)$/.exec(runtime);
  return match ? Number(match[1]) : null;
}

export function resolveMobileReleaseState({
  runningVersion,
  nativeRuntime,
  control,
  updateDownloaded,
  downloadedVersion,
}: {
  runningVersion: string;
  nativeRuntime: string;
  control: MobileReleaseControl | null | undefined;
  updateDownloaded: boolean;
  downloadedVersion?: string | null;
}): MobileReleaseState {
  const latestVersion = control?.latestVersion ?? runningVersion;
  const minimumRuntime = control?.minimumRuntime ?? null;
  const installedRuntimeNumber = runtimeNumber(nativeRuntime);
  const supportedRuntimeNumber = control
    ? runtimeNumber(control.supportedRuntime)
    : null;
  const minimumRuntimeNumber = minimumRuntime
    ? runtimeNumber(minimumRuntime)
    : null;

  return {
    runningVersion,
    latestVersion,
    pendingVersion:
      updateDownloaded && downloadedVersion && downloadedVersion !== runningVersion
        ? downloadedVersion
        : null,
    nativeRuntime,
    minimumRuntime,
    needsNativeUpgrade:
      installedRuntimeNumber !== null &&
      supportedRuntimeNumber !== null &&
      installedRuntimeNumber < supportedRuntimeNumber,
    isBelowMinimumRuntime:
      installedRuntimeNumber !== null &&
      minimumRuntimeNumber !== null &&
      installedRuntimeNumber < minimumRuntimeNumber,
  };
}

/** Release identity comes from the downloaded manifest, never the latest ledger. */
export function manifestReleaseVersion(manifest: unknown): string | null {
  if (!manifest || typeof manifest !== "object") return null;
  const extra = (manifest as { extra?: { expoClient?: { version?: unknown; extra?: { mobileReleaseVersion?: unknown } } } }).extra;
  const version = extra?.expoClient?.extra?.mobileReleaseVersion ?? extra?.expoClient?.version;
  return typeof version === "string" && /^\d+\.\d+\.\d+$/.test(version) ? version : null;
}

/** The active update manifest identifies the bundle even if EAS inlined an old env value. */
export function runningReleaseVersion({ manifest, bundleVersion, nativeVersion }: {
  manifest: unknown;
  bundleVersion?: string;
  nativeVersion?: string | null;
}): string {
  return manifestReleaseVersion(manifest) ?? bundleVersion ?? nativeVersion ?? "0.0.0-dev";
}
