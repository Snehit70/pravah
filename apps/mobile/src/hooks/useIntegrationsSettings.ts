import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { classifyError, mobileLogger } from "../lib/logger";

import { deriveSyncHealth, summarizeSyncError, type SyncHealth } from "../lib/syncHealth";

type ShowToast = (next: { kind: "error" | "info"; message: string }) => void;
type IntegrationProvider = "google_calendar" | "gmail";

// Re-exported so existing importers (SettingsSheet) keep their import path.
export { summarizeSyncError, type SyncHealth };

const CALENDAR_SELECTION_STORAGE_KEY = "pravah_mobile_google_calendar_selection_v1";
const CALENDAR_SYNCED_IDS_STORAGE_KEY = "pravah_mobile_google_calendar_synced_ids_v1";

type UseIntegrationsSettingsOptions = {
  isAuthenticated: boolean;
  showToast: ShowToast;
};

export type IntegrationLastRunSummary = {
  finishedAt?: number;
  status?: "running" | "success" | "failed";
  importedCount?: number;
  updatedCount?: number;
};

export type GoogleCalendarOption = {
  id: string;
  summary: string;
  primary: boolean;
};

type UseIntegrationsSettingsReturn = {
  isCalendarSyncing: boolean;
  isGoogleToggleSaving: boolean;
  isGmailToggleSaving: boolean;
  googleSyncEnabled: boolean;
  gmailSyncEnabled: boolean;
  calendarSyncStatus: string;
  gmailSyncStatus: string;
  calendarSyncHealth: SyncHealth;
  calendarErrorSummary?: string;
  canToggleGmailSync: boolean;
  pendingGmailReviewCount: number;
  syncSettingsBusy: boolean;
  calendarAccountEmail?: string;
  gmailAccountEmail?: string;
  calendarLastError?: string;
  gmailLastError?: string;
  calendarLastRun?: IntegrationLastRunSummary;
  gmailLastRun?: IntegrationLastRunSummary;
  availableCalendars: GoogleCalendarOption[];
  selectedCalendarIds: string[];
  isLoadingCalendars: boolean;
  isCalendarSelectionReady: boolean;
  toggleCalendarSelected: (id: string) => void;
  toggleGoogleCalendarSync: () => Promise<void>;
  toggleGmailSync: () => Promise<void>;
  runGoogleCalendarSync: () => Promise<void>;
  enableAndSyncGoogleCalendar: () => Promise<void>;
};

export function useIntegrationsSettings({
  isAuthenticated,
  showToast,
}: UseIntegrationsSettingsOptions): UseIntegrationsSettingsReturn {
  const [isCalendarSyncing, setIsCalendarSyncing] = useState(false);
  const [isGoogleToggleSaving, setIsGoogleToggleSaving] = useState(false);
  const [isGmailToggleSaving, setIsGmailToggleSaving] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<GoogleCalendarOption[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [isLoadingCalendars, setIsLoadingCalendars] = useState(false);
  const [isCalendarSelectionReady, setIsCalendarSelectionReady] = useState(false);
  const calendarSelectionHydrated = useRef(false);

  const calendarIntegrationStatus = useQuery(
    api.sync.getIntegrationStatus,
    isAuthenticated ? { provider: "google_calendar" } : "skip"
  );
  const gmailIntegrationStatus = useQuery(
    api.sync.getIntegrationStatus,
    isAuthenticated ? { provider: "gmail" } : "skip"
  );

  const upsertIntegrationMutation = useMutation(api.sync.upsertIntegration);
  const importGoogleCalendarAction = useAction(api.syncActions.importGoogleCalendarAction);
  const listGoogleCalendarsAction = useAction(api.syncActions.listGoogleCalendarsAction);

  const googleSyncEnabled = Boolean(calendarIntegrationStatus?.integration?.syncEnabled);
  const gmailSyncEnabled = Boolean(gmailIntegrationStatus?.integration?.syncEnabled);
  const pendingGmailReviewCount = gmailIntegrationStatus?.pendingReviewCount ?? 0;
  const calendarSyncStatus = calendarIntegrationStatus?.integration?.status ?? "disconnected";
  const gmailSyncStatus = gmailIntegrationStatus?.integration?.status ?? "disconnected";
  const calendarSyncHealth = deriveSyncHealth({
    status: calendarSyncStatus,
    syncEnabled: googleSyncEnabled,
    hasAccount: Boolean(calendarIntegrationStatus?.integration?.accountEmail),
    lastError: calendarIntegrationStatus?.integration?.lastError,
  });
  const calendarErrorSummary = summarizeSyncError(
    calendarIntegrationStatus?.integration?.lastError
  );
  const canToggleGmailSync = gmailSyncStatus === "connected" || gmailSyncEnabled;
  const syncSettingsBusy = isCalendarSyncing || isGoogleToggleSaving || isGmailToggleSaving;

  // Fetch the user's calendar list once Google Calendar sync is enabled so the
  // picker has something to show. Disabling sync clears the list to avoid
  // confusing stale state.
  useEffect(() => {
    if (!isAuthenticated || !googleSyncEnabled) {
      setAvailableCalendars([]);
      if (!isAuthenticated) {
        setSelectedCalendarIds([]);
        calendarSelectionHydrated.current = false;
        setIsCalendarSelectionReady(false);
      }
      return;
    }

    let cancelled = false;
    setIsLoadingCalendars(true);
    void (async () => {
      try {
        let accessToken = (await GoogleSignin.getTokens()).accessToken;
        if (!accessToken) {
          await GoogleSignin.signInSilently();
          accessToken = (await GoogleSignin.getTokens()).accessToken;
        }
        if (!accessToken) return;

        const raw = await listGoogleCalendarsAction({ accessToken });
        if (cancelled) return;

        const calendars: GoogleCalendarOption[] = raw
          .filter((c): c is { id: string; summary?: string; primary?: boolean } => Boolean(c.id))
          .map((c) => ({
            id: c.id,
            summary: c.summary?.trim() || c.id,
            primary: Boolean(c.primary),
          }));

        setAvailableCalendars(calendars);

        if (!calendarSelectionHydrated.current) {
          const storedRaw = await AsyncStorage.getItem(CALENDAR_SELECTION_STORAGE_KEY);
          const storedIds = storedRaw ? (JSON.parse(storedRaw) as unknown) : [];
          const safeStored = Array.isArray(storedIds)
            ? storedIds.filter((v): v is string => typeof v === "string")
            : [];
          const calendarIds = calendars.map((c) => c.id);
          // Keep [] as the "sync all" sentinel — expanding it to concrete IDs
          // would cause newly-added calendars to be silently excluded on the
          // next session. Only store an explicit subset when the user has
          // actually deselected something.
          const nextSelection =
            safeStored.length > 0
              ? safeStored.filter((id) => calendarIds.includes(id))
              : [];
          setSelectedCalendarIds(nextSelection);
          calendarSelectionHydrated.current = true;
          setIsCalendarSelectionReady(true);
        } else {
          // Drop any selected ids that no longer exist in the fresh list.
          setSelectedCalendarIds((prev) => {
            const ids = new Set(calendars.map((c) => c.id));
            return prev.filter((id) => ids.has(id));
          });
        }
      } catch (error) {
        if (cancelled) return;
        mobileLogger.warn("google_calendars_list_failed", {
          errorType: classifyError(error),
        });
      } finally {
        if (!cancelled) setIsLoadingCalendars(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, googleSyncEnabled, listGoogleCalendarsAction]);

  // Persist selection whenever it changes (after first hydration).
  useEffect(() => {
    if (!calendarSelectionHydrated.current) return;
    void (async () => {
      try {
        if (selectedCalendarIds.length === 0) {
          await AsyncStorage.removeItem(CALENDAR_SELECTION_STORAGE_KEY);
        } else {
          await AsyncStorage.setItem(
            CALENDAR_SELECTION_STORAGE_KEY,
            JSON.stringify(selectedCalendarIds),
          );
        }
      } catch (error) {
        mobileLogger.warn("google_calendar_selection_save_failed", {
          errorType: classifyError(error),
        });
      }
    })();
  }, [selectedCalendarIds]);

  const toggleCalendarSelected = useCallback((id: string) => {
    setSelectedCalendarIds((prev) => {
      if (prev.length === 0) {
        // "All calendars" mode — unchecking one means "all except this one".
        // Expand to the full discovered list minus the tapped calendar.
        return availableCalendars.map((c) => c.id).filter((cid) => cid !== id);
      }
      return prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id];
    });
  }, [availableCalendars]);

  const persistIntegrationToggle = useCallback(
    async (provider: IntegrationProvider, syncEnabled: boolean) => {
      const prev =
        provider === "google_calendar"
          ? calendarIntegrationStatus?.integration
          : gmailIntegrationStatus?.integration;
      await upsertIntegrationMutation({
        provider,
        status: prev?.status ?? "disconnected",
        syncEnabled,
        accountEmail: prev?.accountEmail,
      });
    },
    [calendarIntegrationStatus?.integration, gmailIntegrationStatus?.integration, upsertIntegrationMutation]
  );

  const toggleGoogleCalendarSync = useCallback(async () => {
    if (isGoogleToggleSaving) return;
    setIsGoogleToggleSaving(true);
    const next = !googleSyncEnabled;
    try {
      await persistIntegrationToggle("google_calendar", next);
      showToast({
        kind: "info",
        message: next ? "Google Calendar sync enabled." : "Google Calendar sync paused.",
      });
    } catch (error) {
      mobileLogger.warn("google_calendar_toggle_failed", {
        errorType: classifyError(error),
        nextSyncEnabled: next,
      });
      showToast({ kind: "error", message: "Could not update Google Calendar sync." });
    } finally {
      setIsGoogleToggleSaving(false);
    }
  }, [googleSyncEnabled, isGoogleToggleSaving, persistIntegrationToggle, showToast]);

  const toggleGmailSync = useCallback(async () => {
    if (isGmailToggleSaving) return;
    setIsGmailToggleSaving(true);
    const next = !gmailSyncEnabled;
    try {
      await persistIntegrationToggle("gmail", next);
      showToast({
        kind: "info",
        message: next ? "Gmail sync enabled." : "Gmail sync paused.",
      });
    } catch (error) {
      mobileLogger.warn("gmail_toggle_failed", {
        errorType: classifyError(error),
        nextSyncEnabled: next,
      });
      showToast({ kind: "error", message: "Could not update Gmail sync." });
    } finally {
      setIsGmailToggleSaving(false);
    }
  }, [gmailSyncEnabled, isGmailToggleSaving, persistIntegrationToggle, showToast]);

  const runGoogleCalendarSync = useCallback(async () => {
    if (isCalendarSyncing) return;
    // Don't sync before the stored selection has been loaded when there's an
    // explicit subset — calendarIds would reflect stale in-memory state.
    // The all-calendars path (empty selectedCalendarIds) is always safe to
    // proceed: it's the initial state and importing everything is correct.
    if (!isCalendarSelectionReady && selectedCalendarIds.length > 0) {
      showToast({ kind: "info", message: "Calendar list is still loading. Try again shortly." });
      return;
    }
    setIsCalendarSyncing(true);
    try {
      let accessToken = (await GoogleSignin.getTokens()).accessToken;
      if (!accessToken) {
        await GoogleSignin.signInSilently();
        accessToken = (await GoogleSignin.getTokens()).accessToken;
      }
      if (!accessToken) {
        showToast({ kind: "error", message: "Could not get Google token. Please sign in again." });
        return;
      }

      // Force a full resync when any calendar in scope hasn't been fully
      // imported before: either an explicitly selected one, or a newly-added
      // calendar that appeared since the last all-calendars sync.
      let fullResync: boolean | undefined;
      try {
        const storedRaw = await AsyncStorage.getItem(CALENDAR_SYNCED_IDS_STORAGE_KEY);
        const parsed = JSON.parse(storedRaw ?? "[]");
        const syncedIds = new Set<string>(Array.isArray(parsed) ? parsed : []);
        const syncingAll = selectedCalendarIds.length === 0;
        if (syncingAll) {
          // Compare the live calendar list against the IDs recorded after the
          // last all-calendars sync. A calendar absent from that set is new and
          // hasn't been fully imported from the beginning of time yet.
          const currentIds = availableCalendars.map((c) => c.id);
          fullResync = currentIds.some((id) => !syncedIds.has(id)) || undefined;
        } else {
          fullResync = selectedCalendarIds.some((id) => !syncedIds.has(id)) || undefined;
        }
      } catch {
        // If storage read fails, proceed without forcing a resync.
      }

      const syncResult = await importGoogleCalendarAction({
        accessToken,
        calendarIds: selectedCalendarIds.length > 0 ? selectedCalendarIds : undefined,
        fullResync,
      });

      // Record the concrete IDs that were just synced so the next run can
      // detect any newly-added calendar and force a full resync for it.
      // In all-calendars mode use the live availableCalendars list; if it's
      // empty (calendar list not yet loaded) fall back to removing the key
      // so the next sync conservatively treats every calendar as new.
      try {
        const idsToRecord =
          selectedCalendarIds.length === 0
            ? availableCalendars.map((c) => c.id)
            : selectedCalendarIds;
        if (idsToRecord.length === 0) {
          await AsyncStorage.removeItem(CALENDAR_SYNCED_IDS_STORAGE_KEY);
        } else {
          await AsyncStorage.setItem(
            CALENDAR_SYNCED_IDS_STORAGE_KEY,
            JSON.stringify(idsToRecord),
          );
        }
      } catch {
        // Best-effort; next sync for a newly-added calendar will re-trigger.
      }

      const changedCount = syncResult.importedCount + syncResult.updatedCount;
      showToast({
        kind: "info",
        message:
          changedCount > 0
            ? `Synced: ${syncResult.importedCount} imported, ${syncResult.updatedCount} updated.`
            : "Google Calendar is up to date.",
      });
    } catch (error) {
      mobileLogger.warn("google_calendar_sync_failed", { errorType: classifyError(error) });
      showToast({ kind: "error", message: "Google Calendar sync failed. Try again." });
    } finally {
      setIsCalendarSyncing(false);
    }
  }, [availableCalendars, importGoogleCalendarAction, isCalendarSelectionReady, isCalendarSyncing, selectedCalendarIds, showToast]);

  const enableAndSyncGoogleCalendar = useCallback(async () => {
    try {
      await persistIntegrationToggle("google_calendar", true);
      await runGoogleCalendarSync();
    } catch (error) {
      mobileLogger.warn("google_calendar_enable_and_sync_failed", {
        errorType: classifyError(error),
      });
      showToast({ kind: "error", message: "Could not enable Google Calendar sync." });
    }
  }, [persistIntegrationToggle, runGoogleCalendarSync, showToast]);

  const calendarLastRun = calendarIntegrationStatus?.lastRun
    ? {
        finishedAt: calendarIntegrationStatus.lastRun.finishedAt,
        status: calendarIntegrationStatus.lastRun.status,
        importedCount: calendarIntegrationStatus.lastRun.importedCount,
        updatedCount: calendarIntegrationStatus.lastRun.updatedCount,
      }
    : undefined;
  const gmailLastRun = gmailIntegrationStatus?.lastRun
    ? {
        finishedAt: gmailIntegrationStatus.lastRun.finishedAt,
        status: gmailIntegrationStatus.lastRun.status,
        importedCount: gmailIntegrationStatus.lastRun.importedCount,
        updatedCount: gmailIntegrationStatus.lastRun.updatedCount,
      }
    : undefined;

  return {
    isCalendarSyncing,
    isGoogleToggleSaving,
    isGmailToggleSaving,
    googleSyncEnabled,
    gmailSyncEnabled,
    calendarSyncStatus,
    gmailSyncStatus,
    calendarSyncHealth,
    calendarErrorSummary,
    canToggleGmailSync,
    pendingGmailReviewCount,
    syncSettingsBusy,
    calendarAccountEmail: calendarIntegrationStatus?.integration?.accountEmail,
    gmailAccountEmail: gmailIntegrationStatus?.integration?.accountEmail,
    calendarLastError: calendarIntegrationStatus?.integration?.lastError,
    gmailLastError: gmailIntegrationStatus?.integration?.lastError,
    calendarLastRun,
    gmailLastRun,
    availableCalendars,
    selectedCalendarIds,
    isLoadingCalendars,
    isCalendarSelectionReady,
    toggleCalendarSelected,
    toggleGoogleCalendarSync,
    toggleGmailSync,
    runGoogleCalendarSync,
    enableAndSyncGoogleCalendar,
  };
}
