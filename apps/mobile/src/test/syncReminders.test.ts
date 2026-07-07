/** @vitest-environment happy-dom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
let queueReminderSync: typeof import("../lib/syncReminders").queueReminderSync;
let __resetReminderSyncQueue: typeof import("../lib/syncReminders").__resetReminderSyncQueue;

describe("syncRemindersAsync", () => {
  beforeAll(async () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    ({
      cancelAllRemindersAsync,
      REMINDERS_CHANNEL_ID,
      syncRemindersAsync,
      queueReminderSync,
      __resetReminderSyncQueue,
    } = await import("../lib/syncReminders"));
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

describe("queueReminderSync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    __resetReminderSyncQueue();
    getAllScheduledNotificationsAsync.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces rapid calls into one sync of the latest specs", async () => {
    const first = vi.fn(() => [] as ReminderSpec[]);
    const latest = vi.fn(() => [] as ReminderSpec[]);
    const onError = vi.fn();

    queueReminderSync(first, onError);
    vi.advanceTimersByTime(200);
    queueReminderSync(latest, onError);
    vi.advanceTimersByTime(400);
    await vi.runAllTimersAsync();

    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
    expect(getAllScheduledNotificationsAsync).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("does not run before the debounce window elapses", () => {
    const getSpecs = vi.fn(() => [] as ReminderSpec[]);
    queueReminderSync(getSpecs, vi.fn());
    vi.advanceTimersByTime(399);
    expect(getSpecs).not.toHaveBeenCalled();
  });

  it("reports sync failures through onError", async () => {
    getAllScheduledNotificationsAsync.mockRejectedValueOnce(new Error("boom"));
    const onError = vi.fn();
    queueReminderSync(() => [], onError, 0);
    await vi.runAllTimersAsync();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
