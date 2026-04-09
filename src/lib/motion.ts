import type { Transition } from "framer-motion";

export const EASE_STANDARD = [0.22, 1, 0.36, 1] as const;
export const EASE_OVERSHOOT = [0.34, 1.56, 0.64, 1] as const;

export const TRANSITION_XFAST: Transition = { duration: 0.15, ease: EASE_STANDARD };
export const TRANSITION_FAST: Transition = { duration: 0.2, ease: EASE_STANDARD };
export const TRANSITION_BASE: Transition = { duration: 0.25, ease: EASE_STANDARD };
export const TRANSITION_PANEL: Transition = { duration: 0.3, ease: EASE_STANDARD };
export const TRANSITION_SLOW: Transition = { duration: 0.4, ease: EASE_STANDARD };
export const TRANSITION_OVERSHOOT: Transition = { duration: 0.25, ease: EASE_OVERSHOOT };

export function withDelay(transition: Transition, delay: number): Transition {
  return { ...transition, delay };
}
