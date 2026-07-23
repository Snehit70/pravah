import { useCallback, useEffect } from "react";
import { useQuery } from "convex/react";
import * as Updates from "expo-updates";
import * as Application from "expo-application";

import { api } from "../../../../convex/_generated/api";
import { resolveMobileReleaseState } from "../lib/mobileReleaseState";

const RUNNING_VERSION =
  process.env.EXPO_PUBLIC_MOBILE_RELEASE_VERSION ??
  Application.nativeApplicationVersion ??
  "0.0.0-dev";
const NATIVE_RUNTIME = Updates.runtimeVersion || "native-dev";
let updateCheckStarted = false;

export function useMobileRelease() {
  const control = useQuery(api.mobileReleases.getState);
  const publishedReleases = useQuery(api.mobileReleases.listPublished, {
    limit: 10,
  });
  const { isUpdatePending } = Updates.useUpdates();

  useEffect(() => {
    if (!Updates.isEnabled || updateCheckStarted) return;
    updateCheckStarted = true;

    void Updates.checkForUpdateAsync()
      .then((result) => {
        if (result.isAvailable) return Updates.fetchUpdateAsync();
        return undefined;
      })
      .catch(() => {
        // Update checks are best-effort and must never block normal app use.
      });
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
    }),
    publishedReleases: publishedReleases ?? [],
    restartToUpdate,
  };
}
