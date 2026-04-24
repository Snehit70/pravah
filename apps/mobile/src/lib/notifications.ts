import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const DAILY_REMINDER_NOTIFICATION_ID_KEY = "pravah_daily_reminder_notification_id_v1";
const DEFAULT_DAILY_REMINDER_HOUR = 9;
const DEFAULT_DAILY_REMINDER_MINUTE = 0;

export type NotificationPermissionState = "granted" | "denied" | "undetermined";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function initializeNotificationsAsync(): Promise<void> {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#7dd3fc",
  });
}

export async function getNotificationPermissionStateAsync(): Promise<NotificationPermissionState> {
  const permissions = await Notifications.getPermissionsAsync();
  if (permissions.granted) return "granted";
  if (permissions.canAskAgain === false) return "denied";
  return "undetermined";
}

export async function requestNotificationPermissionAsync(): Promise<NotificationPermissionState> {
  const permissions = await Notifications.requestPermissionsAsync();
  if (permissions.granted) return "granted";
  if (permissions.canAskAgain === false) return "denied";
  return "undetermined";
}

export async function isDailyReminderEnabledAsync(): Promise<boolean> {
  const id = await SecureStore.getItemAsync(DAILY_REMINDER_NOTIFICATION_ID_KEY);
  return Boolean(id);
}

export async function scheduleDailyReminderAsync({
  hour = DEFAULT_DAILY_REMINDER_HOUR,
  minute = DEFAULT_DAILY_REMINDER_MINUTE,
}: {
  hour?: number;
  minute?: number;
} = {}): Promise<void> {
  await disableDailyReminderAsync();

  const identifier = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Pravah planner",
      body: "Quick check-in: plan your timeline for today.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });

  await SecureStore.setItemAsync(DAILY_REMINDER_NOTIFICATION_ID_KEY, identifier);
}

export async function disableDailyReminderAsync(): Promise<void> {
  const existingId = await SecureStore.getItemAsync(DAILY_REMINDER_NOTIFICATION_ID_KEY);
  if (existingId) {
    await Notifications.cancelScheduledNotificationAsync(existingId);
    await SecureStore.deleteItemAsync(DAILY_REMINDER_NOTIFICATION_ID_KEY);
  }
}

export async function scheduleTestNotificationAsync(): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Pravah test reminder",
      body: "Notifications are working on this device.",
    },
    trigger: null,
  });
}
