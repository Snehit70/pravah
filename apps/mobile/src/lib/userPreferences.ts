import AsyncStorage from "@react-native-async-storage/async-storage";
import { classifyError, mobileLogger } from "./logger";
import {
  DEFAULT_TAB_ORDER,
  sanitizeTabOrder,
  type TabOrder,
} from "./tabOrder";

const STORAGE_KEY = "pravah_user_prefs_v1";

export type KairoResponseStyle = "concise" | "detailed";
export type ReducedMotionOverride = "system" | "always" | "never";
export type AccentColor = "purple" | "copper" | "teal" | "rose";
export type Density = "cozy" | "compact";
export type UndoWindowMinutes = 5 | 15 | 30 | 60;
export type ReminderLeadTimeMinutes = 5 | 15 | 30 | 60;

export interface UserPreferences {
  morningDigestTime: string;
  reminderLeadTimeMinutes: ReminderLeadTimeMinutes;
  quietHoursEnabled: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  defaultTaskDurationMin: number;
  taskColorScheme: AccentColor;
  kairoTemperature: number;
  kairoResponseStyle: KairoResponseStyle;
  kairoStarterPillsEnabled: boolean;
  kairoUndoWindowMinutes: UndoWindowMinutes;
  reducedMotionOverride: ReducedMotionOverride;
  accentColor: AccentColor;
  density: Density;
  bulkTaskCaptureEnabled: boolean;
  tabOrder: TabOrder;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
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
  tabOrder: [...DEFAULT_TAB_ORDER],
};

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

function isValidTime(value: unknown): value is string {
  return typeof value === "string" && TIME_PATTERN.test(value);
}

function isAccentColor(value: unknown): value is AccentColor {
  return value === "purple" || value === "copper" || value === "teal" || value === "rose";
}

function isUndoWindow(value: unknown): value is UndoWindowMinutes {
  return value === 5 || value === 15 || value === 30 || value === 60;
}

function isReminderLeadTime(value: unknown): value is ReminderLeadTimeMinutes {
  return value === 5 || value === 15 || value === 30 || value === 60;
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

// Reject unexpected shapes per-field so a corrupted blob can't poison the
// runtime. Anything missing or wrong falls back to the default for that key.
function sanitize(raw: unknown): UserPreferences {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_PREFERENCES };
  const r = raw as Record<string, unknown>;
  return {
    morningDigestTime: isValidTime(r.morningDigestTime)
      ? r.morningDigestTime
      : isValidTime(r.dailyReminderTime)
        ? r.dailyReminderTime
        : DEFAULT_PREFERENCES.morningDigestTime,
    reminderLeadTimeMinutes: isReminderLeadTime(r.reminderLeadTimeMinutes)
      ? r.reminderLeadTimeMinutes
      : DEFAULT_PREFERENCES.reminderLeadTimeMinutes,
    quietHoursEnabled:
      typeof r.quietHoursEnabled === "boolean"
        ? r.quietHoursEnabled
        : DEFAULT_PREFERENCES.quietHoursEnabled,
    quietHoursStart: isValidTime(r.quietHoursStart)
      ? r.quietHoursStart
      : DEFAULT_PREFERENCES.quietHoursStart,
    quietHoursEnd: isValidTime(r.quietHoursEnd)
      ? r.quietHoursEnd
      : DEFAULT_PREFERENCES.quietHoursEnd,
    defaultTaskDurationMin: clampNumber(
      r.defaultTaskDurationMin,
      5,
      480,
      DEFAULT_PREFERENCES.defaultTaskDurationMin,
    ),
    taskColorScheme: isAccentColor(r.taskColorScheme)
      ? r.taskColorScheme
      : DEFAULT_PREFERENCES.taskColorScheme,
    kairoTemperature: clampNumber(
      r.kairoTemperature,
      0,
      1.5,
      DEFAULT_PREFERENCES.kairoTemperature,
    ),
    kairoResponseStyle:
      r.kairoResponseStyle === "detailed" ? "detailed" : "concise",
    kairoStarterPillsEnabled:
      typeof r.kairoStarterPillsEnabled === "boolean"
        ? r.kairoStarterPillsEnabled
        : DEFAULT_PREFERENCES.kairoStarterPillsEnabled,
    kairoUndoWindowMinutes: isUndoWindow(r.kairoUndoWindowMinutes)
      ? r.kairoUndoWindowMinutes
      : DEFAULT_PREFERENCES.kairoUndoWindowMinutes,
    reducedMotionOverride:
      r.reducedMotionOverride === "always" || r.reducedMotionOverride === "never"
        ? r.reducedMotionOverride
        : "system",
    accentColor: isAccentColor(r.accentColor)
      ? r.accentColor
      : DEFAULT_PREFERENCES.accentColor,
    density: r.density === "compact" ? "compact" : "cozy",
    bulkTaskCaptureEnabled:
      typeof r.bulkTaskCaptureEnabled === "boolean" ? r.bulkTaskCaptureEnabled : false,
    tabOrder: sanitizeTabOrder(r.tabOrder),
  };
}

export async function loadPreferences(): Promise<UserPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFERENCES };
    return sanitize(JSON.parse(raw));
  } catch (error) {
    mobileLogger.warn("user_prefs_load_failed", { errorType: classifyError(error) });
    return { ...DEFAULT_PREFERENCES };
  }
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    mobileLogger.warn("user_prefs_save_failed", { errorType: classifyError(error) });
  }
}

export async function resetPreferences(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    mobileLogger.warn("user_prefs_reset_failed", { errorType: classifyError(error) });
  }
}

// Exported so tests can verify sanitization without touching AsyncStorage.
export const __testing = { sanitize };
