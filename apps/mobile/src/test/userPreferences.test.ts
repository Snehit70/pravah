import { describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));

vi.mock("../lib/logger", () => ({
  classifyError: () => "unknown",
  mobileLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  __testing,
} from "../lib/userPreferences";

const { sanitize } = __testing;

describe("sanitize", () => {
  it("returns defaults for null / non-object input", () => {
    expect(sanitize(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitize("nope")).toEqual(DEFAULT_PREFERENCES);
    expect(sanitize(42)).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.hideGoalLinkedInboxTasks).toBe(false);
  });

  it("falls back per-field when a value is the wrong shape", () => {
    const result = sanitize({
      morningDigestTime: "not a time",
      reminderLeadTimeMinutes: 17,
      kairoTemperature: "hot",
      kairoUndoWindowMinutes: 17,
      hideGoalLinkedInboxTasks: "yes",
    });
    expect(result.morningDigestTime).toBe(DEFAULT_PREFERENCES.morningDigestTime);
    expect(result.reminderLeadTimeMinutes).toBe(
      DEFAULT_PREFERENCES.reminderLeadTimeMinutes,
    );
    expect(result.kairoTemperature).toBe(DEFAULT_PREFERENCES.kairoTemperature);
    expect(result.kairoUndoWindowMinutes).toBe(
      DEFAULT_PREFERENCES.kairoUndoWindowMinutes,
    );
    expect(result.hideGoalLinkedInboxTasks).toBe(false);
  });

  it("accepts valid values verbatim", () => {
    const result = sanitize({
      morningDigestTime: "07:30",
      reminderLeadTimeMinutes: 30,
      quietHoursEnabled: true,
      quietHoursStart: "23:15",
      quietHoursEnd: "06:00",
      defaultTaskDurationMin: 45,
      taskColorScheme: "teal",
      kairoTemperature: 0.3,
      kairoResponseStyle: "detailed",
      kairoStarterPillsEnabled: false,
      kairoUndoWindowMinutes: 15,
      reducedMotionOverride: "always",
      accentColor: "copper",
      density: "compact",
      bulkTaskCaptureEnabled: true,
      hideGoalLinkedInboxTasks: true,
      tabOrder: ["insights", "goals", "timeline", "inbox"],
    });
    expect(result).toMatchObject({
      morningDigestTime: "07:30",
      reminderLeadTimeMinutes: 30,
      quietHoursEnabled: true,
      taskColorScheme: "teal",
      kairoResponseStyle: "detailed",
      kairoUndoWindowMinutes: 15,
      reducedMotionOverride: "always",
      density: "compact",
      bulkTaskCaptureEnabled: true,
      hideGoalLinkedInboxTasks: true,
      tabOrder: ["insights", "goals", "timeline", "inbox"],
    });
  });

  it("round-trips hideGoalLinkedInboxTasks through persisted preferences", async () => {
    const prefs = { ...DEFAULT_PREFERENCES, hideGoalLinkedInboxTasks: true };

    await savePreferences(prefs);

    const stored = vi.mocked(AsyncStorage.setItem).mock.calls.at(-1)?.[1];
    expect(stored).toBeTruthy();
    vi.mocked(AsyncStorage.getItem).mockResolvedValueOnce(stored ?? null);

    await expect(loadPreferences()).resolves.toMatchObject({
      hideGoalLinkedInboxTasks: true,
    });
  });

  it("falls back to the default tab order for corrupted saved orders", () => {
    expect(sanitize({ tabOrder: ["inbox", "timeline", "goals"] }).tabOrder).toEqual(
      DEFAULT_PREFERENCES.tabOrder,
    );
    expect(sanitize({ tabOrder: ["inbox", "timeline", "goals", "goals"] }).tabOrder).toEqual(
      DEFAULT_PREFERENCES.tabOrder,
    );
    expect(sanitize({ tabOrder: ["inbox", "timeline", "capture", "goals"] }).tabOrder).toEqual(
      DEFAULT_PREFERENCES.tabOrder,
    );
  });

  it("clamps numeric values to the allowed range", () => {
    const high = sanitize({ defaultTaskDurationMin: 5000, kairoTemperature: 99 });
    expect(high.defaultTaskDurationMin).toBe(480);
    expect(high.kairoTemperature).toBe(1.5);

    const low = sanitize({ defaultTaskDurationMin: 0, kairoTemperature: -1 });
    expect(low.defaultTaskDurationMin).toBe(5);
    expect(low.kairoTemperature).toBe(0);
  });

  it("falls back to legacy dailyReminderTime when morningDigestTime is absent", () => {
    const result = sanitize({ dailyReminderTime: "08:15" });
    expect(result.morningDigestTime).toBe("08:15");
  });
});
