/** @vitest-environment happy-dom */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MobileTask } from "../components/TaskCard";
import type { UserPreferences } from "../lib/userPreferences";

const addEventListener = vi.fn();
const planReminders = vi.fn(() => []);
const syncRemindersAsync = vi.fn(async () => undefined);
const prefs: UserPreferences = {
  morningDigestTime: "09:00",
  reminderLeadTimeMinutes: 15,
  quietHoursEnabled: false,
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  defaultTaskDurationMin: 30,
  taskColorScheme: "purple",
  kairoTemperature: 0.7,
  kairoResponseStyle: "concise",
  kairoStarterPillsEnabled: true,
  kairoUndoWindowMinutes: 30,
  reducedMotionOverride: "system",
  accentColor: "purple",
  density: "cozy",
  bulkTaskCaptureEnabled: false,
};

vi.mock("react-native", () => ({
  AppState: { addEventListener },
}));

vi.mock("../lib/planReminders", () => ({
  planReminders,
}));

vi.mock("../lib/syncReminders", () => ({
  syncRemindersAsync,
}));

vi.mock("../lib/logger", () => ({
  classifyError: () => "unknown",
  mobileLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

let useReminderSync: typeof import("../hooks/useReminderSync").useReminderSync;

describe("useReminderSync", () => {
  const tasks: MobileTask[] = [
    {
      _id: "task-1" as MobileTask["_id"],
      title: "Ping",
      deadline: "2026-06-20",
      time: "10:00",
      scheduledAt: 0,
      position: 0,
      updatedAt: 0,
      createdAt: 0,
    },
  ];
  let appStateHandler: ((state: string) => void) | undefined;
  let remove = vi.fn();

  beforeAll(async () => {
    (globalThis as { __DEV__?: boolean }).__DEV__ = false;
    ({ useReminderSync } = await import("../hooks/useReminderSync"));
  });

  beforeEach(() => {
    vi.clearAllMocks();
    remove = vi.fn();
    appStateHandler = undefined;
    addEventListener.mockImplementation((_event: string, handler: (state: string) => void) => {
      appStateHandler = handler;
      return { remove };
    });
  });

  afterEach(() => {
    appStateHandler = undefined;
  });

  it("syncs immediately on task changes when reminders are enabled", () => {
    renderHook(() => useReminderSync(tasks, prefs, true));

    expect(planReminders).toHaveBeenCalledTimes(1);
    expect(planReminders).toHaveBeenCalledWith(tasks, prefs, expect.any(Date));
    expect(syncRemindersAsync).toHaveBeenCalledTimes(1);
  });

  it("re-syncs when the app returns to the foreground", () => {
    renderHook(() => useReminderSync(tasks, prefs, true));

    act(() => {
      appStateHandler?.("background");
      appStateHandler?.("active");
    });

    expect(planReminders).toHaveBeenCalledTimes(2);
    expect(syncRemindersAsync).toHaveBeenCalledTimes(2);
  });

  it("re-syncs when the task list changes", () => {
    const { rerender } = renderHook(
      ({ currentTasks, currentPrefs, enabled }) =>
        useReminderSync(currentTasks, currentPrefs, enabled),
      {
        initialProps: {
          currentTasks: tasks,
          currentPrefs: prefs,
          enabled: true,
        },
      },
    );

    rerender({
      currentPrefs: prefs,
      currentTasks: [
        {
          ...tasks[0],
          time: "11:00",
        },
      ],
      enabled: true,
    });

    expect(planReminders).toHaveBeenCalledTimes(2);
    expect(syncRemindersAsync).toHaveBeenCalledTimes(2);
  });

  it("re-syncs when reminder preferences change", () => {
    const { rerender } = renderHook(
      ({ currentTasks, currentPrefs, enabled }) =>
        useReminderSync(currentTasks, currentPrefs, enabled),
      {
        initialProps: {
          currentTasks: tasks,
          currentPrefs: prefs,
          enabled: true,
        },
      },
    );

    rerender({
      currentTasks: tasks,
      currentPrefs: {
        ...prefs,
        morningDigestTime: "08:30",
      },
      enabled: true,
    });

    expect(planReminders).toHaveBeenCalledTimes(2);
    expect(syncRemindersAsync).toHaveBeenCalledTimes(2);
  });

  it("does nothing when reminders are disabled", () => {
    renderHook(() => useReminderSync(tasks, prefs, false));

    expect(planReminders).not.toHaveBeenCalled();
    expect(syncRemindersAsync).not.toHaveBeenCalled();
    expect(addEventListener).not.toHaveBeenCalled();
  });

  it("removes the app-state subscription on unmount", () => {
    const { unmount } = renderHook(() => useReminderSync(tasks, prefs, true));
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
