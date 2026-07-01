import { useEffect, useState, useSyncExternalStore } from "react";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type UserPreferences,
} from "../lib/userPreferences";

// Single in-process snapshot shared across consumers so toggling a setting
// in the sheet updates the timeline, Kairo, notifications, etc. without
// each subscriber re-reading AsyncStorage.
let snapshot: UserPreferences = { ...DEFAULT_PREFERENCES };
let hydrated = false;
let hydrationPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): UserPreferences {
  return snapshot;
}

export function getUserPreferencesSnapshot(): UserPreferences {
  return snapshot;
}

async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (!hydrationPromise) {
    hydrationPromise = loadPreferences().then((next) => {
      snapshot = next;
      hydrated = true;
      emit();
    });
  }
  await hydrationPromise;
}

export async function setPreference<K extends keyof UserPreferences>(
  key: K,
  value: UserPreferences[K],
): Promise<void> {
  // Hydrate first so we don't overwrite persisted values with defaults when
  // a setter races the initial load.
  await hydrate();
  snapshot = { ...snapshot, [key]: value };
  emit();
  await savePreferences(snapshot);
}

export async function applyPreferences(next: Partial<UserPreferences>): Promise<void> {
  await hydrate();
  snapshot = { ...snapshot, ...next };
  emit();
  await savePreferences(snapshot);
}

export function useUserPreferences(): {
  prefs: UserPreferences;
  ready: boolean;
  setPreference: typeof setPreference;
} {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [ready, setReady] = useState(hydrated);

  useEffect(() => {
    if (hydrated) return; // useState(hydrated) already initialised ready to true
    let cancelled = false;
    void hydrate().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { prefs, ready, setPreference };
}

// Resets the module-level snapshot to defaults so that a wipe during an active
// session doesn't serve stale preferences to components that remount afterward.
export function resetPreferencesStore(): void {
  snapshot = { ...DEFAULT_PREFERENCES };
  hydrated = false;
  hydrationPromise = null;
  emit();
}

// Test-only reset so unit tests can isolate state between cases.
export const __testing = {
  reset() {
    snapshot = { ...DEFAULT_PREFERENCES };
    hydrated = false;
    hydrationPromise = null;
    listeners.clear();
  },
};
