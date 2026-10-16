import { useSyncExternalStore } from "react";
import { getAppearance, setAppearance, subscribeAppearance } from "../lib/appearance";

export function useAppearance() {
  const appearance = useSyncExternalStore(subscribeAppearance, getAppearance, () => "system" as const);
  return [appearance, setAppearance] as const;
}
