const WEB_GOALS_LINKING_FLAG = "pravah:ff:web-goals-linking";

export function isWebGoalsLinkingEnabled(): boolean {
  const envValue = String(import.meta.env.VITE_FF_WEB_GOALS_LINKING ?? "").trim();
  if (envValue === "0" || envValue.toLowerCase() === "false") return false;
  if (envValue === "1" || envValue.toLowerCase() === "true") return true;
  if (typeof window === "undefined") return false;
  const localOverride = window.localStorage.getItem(WEB_GOALS_LINKING_FLAG);
  if (localOverride === "0") return false;
  return true;
}
