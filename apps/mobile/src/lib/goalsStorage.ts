import AsyncStorage from "@react-native-async-storage/async-storage";
import { classifyError, mobileLogger } from "./logger";

const STORAGE_KEY = "pravah_long_term_goals_v1";

export type GoalItem = {
  id: string;
  text: string;
};

function makeId(): string {
  // crypto.randomUUID is available in newer Hermes; fall back to time+random.
  const maybe = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (maybe?.randomUUID) return maybe.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitize(value: unknown): GoalItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is GoalItem =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as { id?: unknown }).id === "string" &&
      typeof (entry as { text?: unknown }).text === "string"
  );
}

export type GoalsLoadResult =
  | { kind: "ok"; goals: GoalItem[] }
  | { kind: "error" };

export async function loadGoals(): Promise<GoalsLoadResult> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { kind: "ok", goals: [] };
    return { kind: "ok", goals: sanitize(JSON.parse(raw)) };
  } catch (error) {
    mobileLogger.warn("goals_load_failed", { errorType: classifyError(error) });
    return { kind: "error" };
  }
}

export async function saveGoals(goals: GoalItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  } catch (error) {
    mobileLogger.warn("goals_save_failed", { errorType: classifyError(error) });
  }
}

export function createGoal(text: string): GoalItem {
  return { id: makeId(), text };
}
