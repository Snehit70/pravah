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

/**
 * Tiny pub/sub store so multiple screens (Goals tab, Capture sheet) can
 * share a single source of truth without a context provider. All mutations
 * go through here; subscribers re-render via useSyncExternalStore.
 */
type Listener = () => void;

let cached: GoalItem[] = [];
let hydrated = false;
let hydratingPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

function ensureHydrated(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydratingPromise) return hydratingPromise;
  hydratingPromise = (async () => {
    const result = await loadGoals();
    if (result.kind === "ok") cached = result.goals;
    hydrated = true;
    emit();
  })();
  return hydratingPromise;
}

export const goalsStore = {
  hydrate: ensureHydrated,
  isHydrated: () => hydrated,
  get: () => cached,
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    void ensureHydrated();
    return () => {
      listeners.delete(listener);
    };
  },
  /** Returns the created goal, or null when `text` is empty or a duplicate. */
  add(text: string): GoalItem | null {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const dup = cached.find((g) => g.text.toLowerCase() === trimmed.toLowerCase());
    if (dup) return null;
    const goal = createGoal(trimmed);
    cached = [...cached, goal];
    void saveGoals(cached);
    emit();
    return goal;
  },
  remove(id: string): void {
    const next = cached.filter((g) => g.id !== id);
    if (next.length === cached.length) return;
    cached = next;
    void saveGoals(cached);
    emit();
  },
  rename(id: string, text: string): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    cached = cached.map((g) => (g.id === id ? { ...g, text: trimmed } : g));
    void saveGoals(cached);
    emit();
  },
};
