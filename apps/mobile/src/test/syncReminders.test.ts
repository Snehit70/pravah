/** @vitest-environment happy-dom */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync,
  scheduleNotificationAsync,
} = vi.hoisted(() => ({
  getAllScheduledNotificationsAsync: vi.fn(),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  scheduleNotificationAsync: vi.fn(async () => "scheduled"),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  getAllScheduledNotificationsAsync,
  cancelScheduledNotificationAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import { REMINDER_ID_PREFIX, type ReminderSpec } from "../lib/planReminders";

let cancelAllRemindersAsync: typeof import("../lib/syncReminders").cancelAllRemindersAsync;
let REMINDERS_CHANNEL_ID: typeof import("../lib/syncReminders").REMINDERS_CHANNEL_ID;
let syncRemindersAsync: typeof import("../lib/syncReminders").syncRemindersAsync;

describe("syncRemindersAsync", () => {
  beforeAll(async () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    ({ cancelAllRemindersAsync, REMINDERS_CHANNEL_ID, syncRemindersAsync } = await import(
      "../lib/syncReminders"
    ));
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("cancels stale reminder notifications and schedules missing ones", async () => {
    getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: `${REMINDER_ID_PREFIX}keep` },
      { identifier: `${REMINDER_ID_PREFIX}stale` },
      { identifier: "foreign-id" },
    ]);

    const fireAt = new Date(2026, 5, 18, 15, 0, 0, 0);
    const specs: ReminderSpec[] = [
      { id: `${REMINDER_ID_PREFIX}keep`, fireAt, title: "Pravah", body: "Keep" },
      { id: `${REMINDER_ID_PREFIX}new`, fireAt, title: "Pravah", body: "New" },
    ];

    await syncRemindersAsync(specs);

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledTimes(1);
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      `${REMINDER_ID_PREFIX}stale`,
    );
    expect(scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: `${REMINDER_ID_PREFIX}new`,
      content: { title: "Pravah", body: "New", sound: true },
      trigger: {
        type: "date",
        date: fireAt,
        channelId: REMINDERS_CHANNEL_ID,
      },
    });
  });

  it("cancels every Pravah-managed reminder on reset", async () => {
    getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: `${REMINDER_ID_PREFIX}one` },
      { identifier: "some-other-app" },
      { identifier: `${REMINDER_ID_PREFIX}two` },
    ]);

    await cancelAllRemindersAsync();

    expect(cancelScheduledNotificationAsync).toHaveBeenCalledTimes(2);
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      `${REMINDER_ID_PREFIX}one`,
    );
    expect(cancelScheduledNotificationAsync).toHaveBeenCalledWith(
      `${REMINDER_ID_PREFIX}two`,
    );
  });
});
