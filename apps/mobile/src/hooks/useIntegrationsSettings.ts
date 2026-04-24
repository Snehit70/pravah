import { useCallback, useState } from "react";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";

type ShowToast = (next: { kind: "error" | "info"; message: string }) => void;
type IntegrationProvider = "google_calendar" | "gmail";

type UseIntegrationsSettingsOptions = {
  isAuthenticated: boolean;
  showToast: ShowToast;
};

type UseIntegrationsSettingsReturn = {
  isCalendarSyncing: boolean;
  isGoogleToggleSaving: boolean;
  isGmailToggleSaving: boolean;
  googleSyncEnabled: boolean;
  gmailSyncEnabled: boolean;
  calendarSyncStatus: string;
  gmailSyncStatus: string;
  canToggleGmailSync: boolean;
  pendingGmailReviewCount: number;
  syncSettingsBusy: boolean;
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

  const googleSyncEnabled = Boolean(calendarIntegrationStatus?.integration?.syncEnabled);
  const gmailSyncEnabled = Boolean(gmailIntegrationStatus?.integration?.syncEnabled);
  const pendingGmailReviewCount = gmailIntegrationStatus?.pendingReviewCount ?? 0;
  const calendarSyncStatus = calendarIntegrationStatus?.integration?.status ?? "disconnected";
  const gmailSyncStatus = gmailIntegrationStatus?.integration?.status ?? "disconnected";
  const canToggleGmailSync = gmailSyncStatus === "connected" || gmailSyncEnabled;
  const syncSettingsBusy = isCalendarSyncing || isGoogleToggleSaving || isGmailToggleSaving;

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
    } catch {
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
    } catch {
      showToast({ kind: "error", message: "Could not update Gmail sync." });
    } finally {
      setIsGmailToggleSaving(false);
    }
  }, [gmailSyncEnabled, isGmailToggleSaving, persistIntegrationToggle, showToast]);

  const runGoogleCalendarSync = useCallback(async () => {
    if (isCalendarSyncing) return;
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
      await importGoogleCalendarAction({ accessToken });
      showToast({ kind: "info", message: "Google Calendar sync complete." });
    } catch {
      showToast({ kind: "error", message: "Google Calendar sync failed. Try again." });
    } finally {
      setIsCalendarSyncing(false);
    }
  }, [importGoogleCalendarAction, isCalendarSyncing, showToast]);

  const enableAndSyncGoogleCalendar = useCallback(async () => {
    try {
      await persistIntegrationToggle("google_calendar", true);
      await runGoogleCalendarSync();
    } catch {
      showToast({ kind: "error", message: "Could not enable Google Calendar sync." });
    }
  }, [persistIntegrationToggle, runGoogleCalendarSync, showToast]);

  return {
    isCalendarSyncing,
    isGoogleToggleSaving,
    isGmailToggleSaving,
    googleSyncEnabled,
    gmailSyncEnabled,
    calendarSyncStatus,
    gmailSyncStatus,
    canToggleGmailSync,
    pendingGmailReviewCount,
    syncSettingsBusy,
    toggleGoogleCalendarSync,
    toggleGmailSync,
    runGoogleCalendarSync,
    enableAndSyncGoogleCalendar,
  };
}
