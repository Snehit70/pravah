import { useCallback, useEffect, useState } from "react";
import {
  disableDailyReminderAsync,
  getNotificationPermissionStateAsync,
  initializeNotificationsAsync,
  isDailyReminderEnabledAsync,
  requestNotificationPermissionAsync,
  scheduleDailyReminderAsync,
  scheduleTestNotificationAsync,
  type NotificationPermissionState,
} from "../lib/notifications";
import { classifyError, mobileLogger } from "../lib/logger";
import { useUserPreferences } from "./useUserPreferences";

type ToastState = { kind: "error" | "info"; message: string };
type ShowToast = (next: ToastState) => void;

type UseNotificationsSettingsReturn = {
  notificationPermissionState: NotificationPermissionState;
  isDailyReminderEnabled: boolean;
  isNotificationsBusy: boolean;
  notificationsEnabled: boolean;
  requestNotificationsAccess: () => Promise<void>;
  toggleDailyReminder: () => Promise<void>;
  sendTestNotification: () => Promise<void>;
};

function parseTime(value: string): { hour: number; minute: number } {
  const [h, m] = value.split(":").map(Number);
  // Sanitization in userPreferences guarantees the format; this is a belt &
  // braces fallback for an out-of-band write.
  if (Number.isNaN(h) || Number.isNaN(m)) return { hour: 9, minute: 0 };
  return { hour: h, minute: m };
}

function formatClock(value: string): string {
  const { hour, minute } = parseTime(value);
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${minute.toString().padStart(2, "0")} ${period}`;
}

export function useNotificationsSettings(showToast: ShowToast): UseNotificationsSettingsReturn {
  const { prefs } = useUserPreferences();
  const [notificationPermissionState, setNotificationPermissionState] =
    useState<NotificationPermissionState>("undetermined");
  const [isNotificationsBusy, setIsNotificationsBusy] = useState(false);
  const [isDailyReminderEnabled, setIsDailyReminderEnabled] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await initializeNotificationsAsync();
        const [permission, dailyEnabled] = await Promise.all([
          getNotificationPermissionStateAsync(),
          isDailyReminderEnabledAsync(),
        ]);
        if (!mounted) return;
        setNotificationPermissionState(permission);
        setIsDailyReminderEnabled(dailyEnabled);
      } catch (error) {
        mobileLogger.warn("notifications_bootstrap_failed", {
          errorType: classifyError(error),
        });
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Reschedule whenever the configured reminder time changes while the
  // reminder is on. Without this, edits to the time picker would only take
  // effect on the next toggle-off/on cycle.
  useEffect(() => {
    if (!isDailyReminderEnabled) return;
    if (notificationPermissionState !== "granted") return;
    const { hour, minute } = parseTime(prefs.dailyReminderTime);
    void scheduleDailyReminderAsync({ hour, minute }).catch((error) => {
      mobileLogger.warn("daily_reminder_reschedule_failed", {
        errorType: classifyError(error),
      });
    });
  }, [prefs.dailyReminderTime, isDailyReminderEnabled, notificationPermissionState]);

  const requestNotificationsAccess = useCallback(async () => {
    if (isNotificationsBusy) return;
    setIsNotificationsBusy(true);
    try {
      const permission = await requestNotificationPermissionAsync();
      setNotificationPermissionState(permission);
      if (permission === "granted") {
        showToast({ kind: "info", message: "Notifications enabled." });
      } else {
        showToast({ kind: "error", message: "Notification permission not granted." });
      }
    } catch (error) {
      mobileLogger.warn("notifications_permission_request_failed", {
        errorType: classifyError(error),
      });
      showToast({ kind: "error", message: "Could not update notification permission." });
    } finally {
      setIsNotificationsBusy(false);
    }
  }, [isNotificationsBusy, showToast]);

  const toggleDailyReminder = useCallback(async () => {
    if (isNotificationsBusy) return;
    setIsNotificationsBusy(true);
    try {
      let permission = notificationPermissionState;
      if (permission !== "granted") {
        permission = await requestNotificationPermissionAsync();
        setNotificationPermissionState(permission);
      }

      if (permission !== "granted") {
        showToast({ kind: "error", message: "Enable notifications to use reminders." });
        return;
      }

      const next = !isDailyReminderEnabled;
      if (next) {
        const { hour, minute } = parseTime(prefs.dailyReminderTime);
        await scheduleDailyReminderAsync({ hour, minute });
        setIsDailyReminderEnabled(true);
        showToast({
          kind: "info",
          message: `Daily reminder set for ${formatClock(prefs.dailyReminderTime)}.`,
        });
      } else {
        await disableDailyReminderAsync();
        setIsDailyReminderEnabled(false);
        showToast({ kind: "info", message: "Daily reminder disabled." });
      }
    } catch (error) {
      mobileLogger.warn("daily_reminder_toggle_failed", {
        errorType: classifyError(error),
        wasEnabled: isDailyReminderEnabled,
      });
      showToast({ kind: "error", message: "Could not update daily reminder." });
    } finally {
      setIsNotificationsBusy(false);
    }
  }, [
    isDailyReminderEnabled,
    isNotificationsBusy,
    notificationPermissionState,
    prefs.dailyReminderTime,
    showToast,
  ]);

  const sendTestNotification = useCallback(async () => {
    if (isNotificationsBusy) return;
    setIsNotificationsBusy(true);
    try {
      let permission = notificationPermissionState;
      if (permission !== "granted") {
        permission = await requestNotificationPermissionAsync();
        setNotificationPermissionState(permission);
      }
      if (permission !== "granted") {
        showToast({ kind: "error", message: "Enable notifications to send a test alert." });
        return;
      }
      await scheduleTestNotificationAsync();
      showToast({ kind: "info", message: "Test notification sent." });
    } catch (error) {
      mobileLogger.warn("test_notification_failed", { errorType: classifyError(error) });
      showToast({ kind: "error", message: "Could not send test notification." });
    } finally {
      setIsNotificationsBusy(false);
    }
  }, [isNotificationsBusy, notificationPermissionState, showToast]);

  return {
    notificationPermissionState,
    isDailyReminderEnabled,
    isNotificationsBusy,
    notificationsEnabled: notificationPermissionState === "granted",
    requestNotificationsAccess,
    toggleDailyReminder,
    sendTestNotification,
  };
}
