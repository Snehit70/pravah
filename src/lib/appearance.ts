export type WebAppearance = "system" | "light" | "dark";
export const APPEARANCE_STORAGE_KEY = "pravah:web-appearance";
const listeners = new Set<() => void>();
let preference: WebAppearance = loadAppearance();
let media: MediaQueryList | undefined;

function isAppearance(value: unknown): value is WebAppearance {
  return value === "system" || value === "light" || value === "dark";
}

export function loadAppearance(): WebAppearance {
  try {
    const stored = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    return isAppearance(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function getAppearance(): WebAppearance {
  return preference;
}

export function subscribeAppearance(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function applyAppearance(): void {
  const dark = preference === "dark" || preference === "system" && Boolean(media?.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function notify(): void {
  applyAppearance();
  listeners.forEach((listener) => listener());
}

export function setAppearance(value: WebAppearance): void {
  preference = value;
  try { localStorage.setItem(APPEARANCE_STORAGE_KEY, value); }
  catch { /* Keep the selection for this session when storage is unavailable. */ }
  notify();
}

/** Install once at startup, before React mounts. Returns cleanup for tests/HMR. */
export function initializeAppearance(): () => void {
  preference = loadAppearance();
  media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onSystemChange = () => applyAppearance();
  const onStorage = (event: StorageEvent) => {
    if (event.key !== APPEARANCE_STORAGE_KEY && event.key !== null) return;
    preference = loadAppearance();
    notify();
  };
  media?.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  notify();
  return () => {
    media?.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}
