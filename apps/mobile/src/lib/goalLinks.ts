/**
 * goalLinks
 *
 * Mobile-local map of taskId → goalId. Tasks sync via Convex but goals
 * stay on-device (matching the web localStorage policy), so we keep the
 * linkage local too. Orphan links (task deleted server-side) are kept on
 * disk but filtered out by callers via `tasksFor` — a periodic compaction
 * can prune them later.
 *
 * Same pub/sub shape as goalsStore so screens can mix the two with one
 * useSyncExternalStore.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { classifyError, mobileLogger } from "./logger";

const STORAGE_KEY = "pravah_goal_links_v1";

export type GoalLinkMap = Record<string, string>;

function sanitize(value: unknown): GoalLinkMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: GoalLinkMap = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string" && typeof k === "string" && k && v) out[k] = v;
  }
  return out;
}

type Listener = () => void;

let cached: GoalLinkMap = {};
let hydrated = false;
let hydratingPromise: Promise<void> | null = null;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

async function persist(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cached));
  } catch (error) {
    mobileLogger.warn("goal_links_save_failed", { errorType: classifyError(error) });
  }
}

function ensureHydrated(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydratingPromise) return hydratingPromise;
  hydratingPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      cached = raw ? sanitize(JSON.parse(raw)) : {};
    } catch (error) {
      mobileLogger.warn("goal_links_load_failed", { errorType: classifyError(error) });
      cached = {};
    }
    hydrated = true;
    emit();
  })();
  return hydratingPromise;
}

export const goalLinksStore = {
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
  goalFor(taskId: string): string | undefined {
    return cached[taskId];
  },
  setLink(taskId: string, goalId: string | null): void {
    if (!taskId) return;
    const apply = () => {
      if (goalId == null) {
        if (!(taskId in cached)) return;
        const next = { ...cached };
        delete next[taskId];
        cached = next;
      } else {
        if (cached[taskId] === goalId) return;
        cached = { ...cached, [taskId]: goalId };
      }
      void persist();
      emit();
    };
    // Await hydration so we never clobber links loaded from AsyncStorage
    // with a write that races the initial load on cold launch.
    if (hydrated) {
      apply();
    } else {
      void ensureHydrated().then(apply);
    }
  },
  /** Remove every link pointing at this goal — used when the goal is deleted. */
  clearGoal(goalId: string): void {
    let changed = false;
    const next: GoalLinkMap = {};
    for (const [taskId, gid] of Object.entries(cached)) {
      if (gid === goalId) {
        changed = true;
        continue;
      }
      next[taskId] = gid;
    }
    if (!changed) return;
    cached = next;
    void persist();
    emit();
  },
  _syncFromServer(links: GoalLinkMap): void {
    cached = links;
    hydrated = true;
    hydratingPromise = null;
    emit();
    void persist();
  },
  reset(): void {
    cached = {};
    hydrated = false;
    hydratingPromise = null;
    emit();
  },
};
