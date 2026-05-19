import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";
import { useUserPreferences } from "./useUserPreferences";

/**
 * Tracks the OS-level reduce-motion accessibility setting.
 *
 * Mobile motion (skeleton pulses, section reveals) should subscribe to this
 * and skip animation when the user has asked the system to minimize motion.
 * Defaults to `false` so motion plays in unsupported environments (tests,
 * older Android targets) instead of silently turning everything off.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  const { prefs } = useUserPreferences();

  useEffect(() => {
    let mounted = true;

    const apply = (value: boolean) => {
      if (mounted) setReduced(Boolean(value));
    };

    AccessibilityInfo.isReduceMotionEnabled?.()
      .then(apply)
      .catch(() => {
        // Some platforms throw if the setting isn't queryable yet — treat as
        // "motion allowed" rather than failing closed.
      });

    const sub = AccessibilityInfo.addEventListener?.(
      "reduceMotionChanged",
      apply
    );

    return () => {
      mounted = false;
      sub?.remove?.();
    };
  }, []);

  if (prefs.reducedMotionOverride === "always") return true;
  if (prefs.reducedMotionOverride === "never") return false;
  return reduced;
}
