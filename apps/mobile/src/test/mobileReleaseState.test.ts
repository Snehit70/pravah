import { describe, expect, it } from "vitest";

import { resolveMobileReleaseState } from "../lib/mobileReleaseState";

describe("resolveMobileReleaseState", () => {
  it("keeps the embedded bundle version primary while reporting a newer published release", () => {
    expect(
      resolveMobileReleaseState({
        runningVersion: "3.0.3",
        nativeRuntime: "native-2",
        control: {
          latestVersion: "3.0.4",
          supportedRuntime: "native-2",
          minimumRuntime: "native-1",
        },
        updateDownloaded: false,
      }),
    ).toEqual({
      runningVersion: "3.0.3",
      latestVersion: "3.0.4",
      pendingVersion: null,
      nativeRuntime: "native-2",
      minimumRuntime: "native-1",
      needsNativeUpgrade: false,
      isBelowMinimumRuntime: false,
    });
  });

  it("exposes a downloaded release as pending until the user restarts", () => {
    expect(
      resolveMobileReleaseState({
        runningVersion: "3.0.3",
        nativeRuntime: "native-2",
        control: {
          latestVersion: "3.0.4",
          supportedRuntime: "native-2",
          minimumRuntime: "native-1",
        },
        updateDownloaded: true,
        downloadedVersion: "3.0.4",
      }).pendingVersion,
    ).toBe("3.0.4");
  });

  it("does not label an older or unknown downloaded bundle as the latest release", () => {
    const input = { runningVersion: "3.0.22", nativeRuntime: "native-5", control: { latestVersion: "3.0.25", supportedRuntime: "native-5" }, updateDownloaded: true };
    expect(resolveMobileReleaseState({ ...input, downloadedVersion: "3.0.24" }).pendingVersion).toBe("3.0.24");
    expect(resolveMobileReleaseState(input).pendingVersion).toBeNull();
  });

  it("advises a native upgrade when the installed runtime is below the minimum", () => {
    const state = resolveMobileReleaseState({
        runningVersion: "3.0.3",
        nativeRuntime: "native-1",
        control: {
          latestVersion: "3.0.4",
          supportedRuntime: "native-2",
          minimumRuntime: "native-2",
        },
        updateDownloaded: false,
      });
    expect(state.needsNativeUpgrade).toBe(true);
    expect(state.isBelowMinimumRuntime).toBe(true);
  });

  it("advises upgrading an older supported runtime without blocking it", () => {
    const state = resolveMobileReleaseState({
      runningVersion: "3.0.3",
      nativeRuntime: "native-1",
      control: {
        latestVersion: "3.0.4",
        supportedRuntime: "native-2",
        minimumRuntime: "native-1",
      },
      updateDownloaded: false,
    });
    expect(state.needsNativeUpgrade).toBe(true);
    expect(state.isBelowMinimumRuntime).toBe(false);
  });
});
