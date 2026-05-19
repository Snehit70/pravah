import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
}));

vi.mock("expo-notifications", () => ({
  setNotificationHandler: vi.fn(),
  setNotificationChannelAsync: vi.fn(async () => undefined),
  getPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: true })),
  requestPermissionsAsync: vi.fn(async () => ({ granted: false, canAskAgain: true })),
  scheduleNotificationAsync: vi.fn(async () => "id"),
  cancelScheduledNotificationAsync: vi.fn(async () => undefined),
  AndroidImportance: { DEFAULT: 3 },
  SchedulableTriggerInputTypes: { DAILY: "daily" },
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

import { isWithinQuietHours } from "../lib/notifications";

describe("isWithinQuietHours", () => {
  it("returns false when quiet hours are disabled", () => {
    expect(
      isWithinQuietHours("23:00", { enabled: false, start: "22:00", end: "07:00" }),
    ).toBe(false);
  });

  it("handles wrap-around windows that cross midnight", () => {
    const opts = { enabled: true, start: "22:00", end: "07:00" } as const;
    expect(isWithinQuietHours("23:30", opts)).toBe(true);
    expect(isWithinQuietHours("02:00", opts)).toBe(true);
    expect(isWithinQuietHours("07:00", opts)).toBe(false);
    expect(isWithinQuietHours("12:00", opts)).toBe(false);
    expect(isWithinQuietHours("21:59", opts)).toBe(false);
    expect(isWithinQuietHours("22:00", opts)).toBe(true);
  });

  it("handles same-day windows where start < end", () => {
    const opts = { enabled: true, start: "13:00", end: "15:00" } as const;
    expect(isWithinQuietHours("13:00", opts)).toBe(true);
    expect(isWithinQuietHours("14:30", opts)).toBe(true);
    expect(isWithinQuietHours("15:00", opts)).toBe(false);
    expect(isWithinQuietHours("12:59", opts)).toBe(false);
  });

  it("returns false when start equals end (zero-length window)", () => {
    expect(
      isWithinQuietHours("10:00", { enabled: true, start: "10:00", end: "10:00" }),
    ).toBe(false);
  });

  it("returns false for malformed time strings", () => {
    expect(
      isWithinQuietHours("not a time", { enabled: true, start: "22:00", end: "07:00" }),
    ).toBe(false);
    expect(
      isWithinQuietHours("23:00", { enabled: true, start: "bad", end: "07:00" }),
    ).toBe(false);
  });
});
