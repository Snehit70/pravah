import AsyncStorage from "@react-native-async-storage/async-storage";
import { classifyError, mobileLogger } from "./logger";

const STORAGE_KEY = "pravah_long_term_goals_v1";

export type GoalPriority = "p1" | "p2" | "p3";

export type GoalItem = {
  id: string;
  text: string;
  description?: string;
  /** Target date in YYYY-MM-DD. Optional — goals without one are open-ended. */
  deadline?: string;
  priority?: GoalPriority;
  /** ms epoch. Optional because legacy goals saved before this field exists. */
  createdAt?: number;
};

export type GoalDraft = {
  text: string;
  description?: string;
  deadline?: string;
  priority?: GoalPriority;
};

function makeId(): string {
  // crypto.randomUUID is available in newer Hermes; fall back to time+random.
  const maybe = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (maybe?.randomUUID) return maybe.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function sanitize(value: unknown): GoalItem[] {
  if (!Array.isArray(value)) return [];
  const out: GoalItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.text !== "string") continue;
    const goal: GoalItem = { id: e.id, text: e.text };
    if (typeof e.description === "string") goal.description = e.description;
    if (typeof e.deadline === "string") goal.deadline = e.deadline;
    if (e.priority === "p1" || e.priority === "p2" || e.priority === "p3") {
      goal.priority = e.priority;
    }
    if (typeof e.createdAt === "number") goal.createdAt = e.createdAt;
    out.push(goal);
  }
  return out;
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

export function createGoal(draft: GoalDraft | string): GoalItem {
  if (typeof draft === "string") {
    return { id: makeId(), text: draft, createdAt: Date.now() };
  }
  const goal: GoalItem = { id: makeId(), text: draft.text, createdAt: Date.now() };
  if (draft.description) goal.description = draft.description;
  if (draft.deadline) goal.deadline = draft.deadline;
  if (draft.priority) goal.priority = draft.priority;
  return goal;
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
  /** Returns the created goal, or null when text is empty or a duplicate. */
  async add(draft: GoalDraft | string): Promise<GoalItem | null> {
    const text = typeof draft === "string" ? draft.trim() : draft.text.trim();
    if (!text) return null;
    await ensureHydrated();
    const dup = cached.find((g) => g.text.toLowerCase() === text.toLowerCase());
    if (dup) return null;
    const goal = createGoal(
      typeof draft === "string"
        ? text
        : {
            text,
            description: draft.description?.trim() || undefined,
            deadline: draft.deadline?.trim() || undefined,
            priority: draft.priority,
          },
    );
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
  _syncFromServer(goals: GoalItem[]): void {
    cached = goals;
    hydrated = true;
    hydratingPromise = null;
    emit();
    void saveGoals(cached);
  },
  reset(): void {
    cached = [];
    hydrated = false;
    hydratingPromise = null;
    emit();
  },
};
