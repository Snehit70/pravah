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
}: {
  runningVersion: string;
  nativeRuntime: string;
  control: MobileReleaseControl | null | undefined;
  updateDownloaded: boolean;
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
      updateDownloaded && latestVersion !== runningVersion
        ? latestVersion
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
