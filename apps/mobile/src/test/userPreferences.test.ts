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

import { DEFAULT_PREFERENCES, __testing } from "../lib/userPreferences";

const { sanitize } = __testing;

describe("sanitize", () => {
  it("returns defaults for null / non-object input", () => {
    expect(sanitize(null)).toEqual(DEFAULT_PREFERENCES);
    expect(sanitize("nope")).toEqual(DEFAULT_PREFERENCES);
    expect(sanitize(42)).toEqual(DEFAULT_PREFERENCES);
  });

  it("falls back per-field when a value is the wrong shape", () => {
    const result = sanitize({
      dailyReminderTime: "not a time",
      kairoTemperature: "hot",
      kairoUndoWindowMinutes: 17,
    });
    expect(result.dailyReminderTime).toBe(DEFAULT_PREFERENCES.dailyReminderTime);
    expect(result.kairoTemperature).toBe(DEFAULT_PREFERENCES.kairoTemperature);
    expect(result.kairoUndoWindowMinutes).toBe(
      DEFAULT_PREFERENCES.kairoUndoWindowMinutes,
    );
  });

  it("accepts valid values verbatim", () => {
    const result = sanitize({
      dailyReminderTime: "07:30",
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
    });
    expect(result).toMatchObject({
      dailyReminderTime: "07:30",
      quietHoursEnabled: true,
      taskColorScheme: "teal",
      kairoResponseStyle: "detailed",
      kairoUndoWindowMinutes: 15,
      reducedMotionOverride: "always",
      density: "compact",
    });
  });

  it("clamps numeric values to the allowed range", () => {
    const high = sanitize({ defaultTaskDurationMin: 5000, kairoTemperature: 99 });
    expect(high.defaultTaskDurationMin).toBe(480);
    expect(high.kairoTemperature).toBe(1.5);

    const low = sanitize({ defaultTaskDurationMin: 0, kairoTemperature: -1 });
    expect(low.defaultTaskDurationMin).toBe(5);
    expect(low.kairoTemperature).toBe(0);
  });
});
