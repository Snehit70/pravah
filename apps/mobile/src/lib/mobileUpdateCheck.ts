export type OtaCheckState = {
  status:
    | "idle"
    | "checking"
    | "downloading"
    | "downloaded"
    | "unavailable"
    | "failed"
    | "disabled";
  reason?: string;
};

type UpdateAdapter = {
  isEnabled: boolean;
  check: () => Promise<{ isAvailable: boolean; reason?: string }>;
  fetch: () => Promise<unknown>;
  record: (state: OtaCheckState) => void;
};

/** Shared across hook consumers; foreground/manual checks can retry failed requests. */
export function createMobileUpdateCheck(adapter: UpdateAdapter) {
  let state: OtaCheckState = { status: "idle" };
  let inFlight: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const set = (next: OtaCheckState) => {
    state = next;
    adapter.record(next);
    for (const listener of listeners) listener();
  };
  return {
    snapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    check: () => {
      if (inFlight) return inFlight;
      if (!adapter.isEnabled) {
        set({ status: "disabled" });
        return Promise.resolve();
      }
      inFlight = (async () => {
        set({ status: "checking" });
        try {
          const result = await adapter.check();
          if (!result.isAvailable) {
            set({ status: "unavailable", reason: result.reason ?? "unknown" });
            return;
          }
          set({ status: "downloading" });
          await adapter.fetch();
          set({ status: "downloaded" });
        } catch {
          set({
            status: "failed",
            reason:
              state.status === "downloading"
                ? "download_failed"
                : "check_failed",
          });
        }
      })().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },
  };
}

export function otaStatusCopy(state: OtaCheckState, pending: boolean): string {
  if (pending) return "App update downloaded. Restart to apply it.";
  switch (state.status) {
    case "idle":
      return "App update has not been checked yet.";
    case "disabled":
      return "App updates are unavailable in this build.";
    case "checking":
      return "Checking for an app update…";
    case "downloading":
      return "Downloading app update…";
    case "downloaded":
      return "App update downloaded. Waiting for restart availability.";
    case "failed":
      return "App-update check or download failed. Try again.";
    case "unavailable":
      return state.reason === "noUpdateAvailableOnServer"
        ? "No newer compatible app update is available."
        : state.reason === "updatePreviouslyFailed"
          ? "The previous app update could not launch. A corrected release is needed."
          : `App update unavailable (${state.reason ?? "unknown"}).`;
  }
}
