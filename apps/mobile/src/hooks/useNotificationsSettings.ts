import { useCallback, useEffect, useState } from "react";
import {
  getNotificationPermissionStateAsync,
  initializeNotificationsAsync,
  requestNotificationPermissionAsync,
  scheduleTestNotificationAsync,
  type NotificationPermissionState,
} from "../lib/notifications";
import { classifyError, mobileLogger } from "../lib/logger";

type ToastState = { kind: "error" | "info"; message: string };
type ShowToast = (next: ToastState) => void;

type UseNotificationsSettingsReturn = {
  notificationPermissionState: NotificationPermissionState;
  isNotificationsBusy: boolean;
  notificationsEnabled: boolean;
  requestNotificationsAccess: () => Promise<void>;
  sendTestNotification: () => Promise<void>;
};

export function useNotificationsSettings(showToast: ShowToast): UseNotificationsSettingsReturn {
  const [notificationPermissionState, setNotificationPermissionState] =
    useState<NotificationPermissionState>("undetermined");
  const [isNotificationsBusy, setIsNotificationsBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        await initializeNotificationsAsync();
        const permission = await getNotificationPermissionStateAsync();
        if (!mounted) return;
        setNotificationPermissionState(permission);
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
    isNotificationsBusy,
    notificationsEnabled: notificationPermissionState === "granted",
    requestNotificationsAccess,
    sendTestNotification,
  };
}
