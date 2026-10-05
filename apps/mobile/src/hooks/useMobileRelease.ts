import { useCallback, useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useQuery } from "convex/react";
import * as Updates from "expo-updates";
import * as Application from "expo-application";
import { api } from "../../../../convex/_generated/api";
import {
  manifestReleaseVersion,
  resolveMobileReleaseState,
} from "../lib/mobileReleaseState";
import { createMobileUpdateCheck } from "../lib/mobileUpdateCheck";
import { mobileLogger } from "../lib/logger";

const RUNNING_VERSION =
  process.env.EXPO_PUBLIC_MOBILE_RELEASE_VERSION ??
  Application.nativeApplicationVersion ??
  "0.0.0-dev";
const NATIVE_RUNTIME = Updates.runtimeVersion || "native-dev";
const checks = createMobileUpdateCheck({
  isEnabled: Updates.isEnabled,
  check: () => Updates.checkForUpdateAsync(),
  fetch: () => Updates.fetchUpdateAsync(),
  record: (state) =>
    mobileLogger.info("ota_check_state", {
      ...state,
      runningVersion: RUNNING_VERSION,
      updateId: Updates.updateId,
      runtime: NATIVE_RUNTIME,
      channel: Updates.channel,
    }),
});
let lastAutomaticCheck = 0;
function automaticCheck() {
  if (Date.now() - lastAutomaticCheck < 60_000) return;
  lastAutomaticCheck = Date.now();
  void checks.check();
}

export function useMobileRelease() {
  const control = useQuery(api.mobileReleases.getState);
  const publishedReleasesResult = useQuery(api.mobileReleases.listPublished, {
    limit: 10,
  });
  const { isUpdatePending, downloadedUpdate, currentlyRunning } =
    Updates.useUpdates();
  const otaCheck = useSyncExternalStore(
    checks.subscribe,
    checks.snapshot,
    checks.snapshot,
  );
  useEffect(() => {
    automaticCheck();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") automaticCheck();
    });
    return () => subscription.remove();
  }, []);
  const restartToUpdate = useCallback(async () => {
    if (isUpdatePending) await Updates.reloadAsync();
  }, [isUpdatePending]);
  return {
    ...resolveMobileReleaseState({
      runningVersion: RUNNING_VERSION,
      nativeRuntime: NATIVE_RUNTIME,
      control,
      updateDownloaded: isUpdatePending,
      downloadedVersion: manifestReleaseVersion(downloadedUpdate?.manifest),
    }),
    installedVersion: Application.nativeApplicationVersion,
    runningUpdateId: currentlyRunning.updateId,
    downloadedUpdateId: downloadedUpdate?.updateId,
    isUpdatePending,
    otaCheck,
    checkForOtaUpdate: checks.check,
    publishedReleases: publishedReleasesResult ?? [],
    isLoadingPublishedReleases: publishedReleasesResult === undefined,
    restartToUpdate,
  };
}
