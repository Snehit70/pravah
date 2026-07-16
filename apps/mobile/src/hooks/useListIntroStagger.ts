/**
 * useListIntroStagger
 *
 * The staggered FadeInDown cascade Goals rows and Progress sections play when
 * their tab opens, packaged for the big windowed lists (Inbox, Timeline) that
 * can't copy it naively:
 *
 * - The stagger is capped at one screenful. Goals delays by raw index, which
 *   is fine for 16 rows but would hand row 90 a multi-second delay here.
 * - Entrances only play inside a short window after the screen mounts. These
 *   lists run `removeClippedSubviews` and window eviction, so rows remount on
 *   scroll — without the guard, scrolling back up would replay the intro.
 *
 * Tab screens lazy-mount on first visit and then stay mounted (App.tsx hides
 * inactive tabs with display:none), so the cascade plays once per session per
 * tab — revisits swap in instantly with no replayed intro.
 */

import { useEffect, useState } from "react";
import { FadeInDown } from "react-native-reanimated";
import { useReducedMotion } from "./useReducedMotion";

/** Rows mounting after this window are scroll traffic, not the intro. */
const INTRO_WINDOW_MS = 700;
/** Matches the Goals cascade: 280ms rows... */
const DURATION_MS = 280;
/** ...at a slightly tighter step, since these lists start ~10 rows deep. */
const STEP_MS = 40;
/** Rows past the first screenful share the final step instead of queuing. */
const MAX_STEPS = 9;

export function useListIntroStagger() {
  const reducedMotion = useReducedMotion();
  const [introActive, setIntroActive] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setIntroActive(false), INTRO_WINDOW_MS);
    return () => clearTimeout(timeout);
  }, []);

  return (index: number) => {
    if (reducedMotion || !introActive) return undefined;
    return FadeInDown.duration(DURATION_MS).delay(Math.min(index, MAX_STEPS) * STEP_MS);
  };
}
