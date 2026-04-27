import { useReducedMotion as useFramerReducedMotion, type Transition } from "framer-motion";

// Single source of truth for motion. Every duration and curve in the web app
// resolves through this file. CSS variables are mirrored at module load so
// inline styles and stylesheets share the same scale.
//
// Tone: calm power-tool. Tight timings, decisive deceleration, no overshoot.

export const DUR = {
  instant: 120,
  fast: 180,
  base: 240,
  slow: 360,
  deliberate: 520,
} as const;

export type DurationKey = keyof typeof DUR;

export const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
export const EASE_OUT_QUART = [0.25, 1, 0.5, 1] as const;
export const EASE_IN_OUT_QUART = [0.76, 0, 0.24, 1] as const;

export type Cubic = readonly [number, number, number, number];

export const exitDur = (enter: number) => Math.round(enter * 0.75);

export function tx(
  properties: string | string[],
  duration: DurationKey = "fast",
  easing: Cubic = EASE_OUT_EXPO,
): string {
  const cb = `cubic-bezier(${easing.join(",")})`;
  const list = Array.isArray(properties) ? properties : [properties];
  return list.map((p) => `${p} ${DUR[duration]}ms ${cb}`).join(", ");
}

const sec = (ms: number) => ms / 1000;

export const T_INSTANT: Transition = { duration: sec(DUR.instant), ease: EASE_OUT_EXPO };
export const T_FAST: Transition = { duration: sec(DUR.fast), ease: EASE_OUT_EXPO };
export const T_BASE: Transition = { duration: sec(DUR.base), ease: EASE_OUT_EXPO };
export const T_SLOW: Transition = { duration: sec(DUR.slow), ease: EASE_OUT_EXPO };
export const T_DELIBERATE: Transition = { duration: sec(DUR.deliberate), ease: EASE_OUT_EXPO };

// Exit transitions run faster than enters. Use these for AnimatePresence exit states.
export const T_EXIT_FAST: Transition = { duration: sec(exitDur(DUR.fast)), ease: EASE_OUT_EXPO };
export const T_EXIT_BASE: Transition = { duration: sec(exitDur(DUR.base)), ease: EASE_OUT_EXPO };
export const T_EXIT_SLOW: Transition = { duration: sec(exitDur(DUR.slow)), ease: EASE_OUT_EXPO };

// Backwards-compat aliases. Kept so existing imports keep compiling during the
// sweep; new code should use the T_* names.
export const TRANSITION_XFAST = T_INSTANT;
export const TRANSITION_FAST = T_FAST;
export const TRANSITION_BASE = T_BASE;
export const TRANSITION_PANEL = T_SLOW;
export const TRANSITION_SLOW = T_SLOW;
export const TRANSITION_OVERSHOOT = T_BASE;
export const EASE_STANDARD = EASE_OUT_EXPO;

export function withDelay(transition: Transition, delay: number): Transition {
  return { ...transition, delay };
}

export function useMotion(preset: Transition = T_BASE): Transition {
  const reduce = useFramerReducedMotion();
  return reduce ? { duration: 0 } : preset;
}

export function useExitMotion(preset: Transition = T_EXIT_BASE): Transition {
  const reduce = useFramerReducedMotion();
  return reduce ? { duration: 0 } : preset;
}

if (typeof document !== "undefined") {
  const root = document.documentElement;
  root.style.setProperty("--dur-instant", `${DUR.instant}ms`);
  root.style.setProperty("--dur-fast", `${DUR.fast}ms`);
  root.style.setProperty("--dur-base", `${DUR.base}ms`);
  root.style.setProperty("--dur-slow", `${DUR.slow}ms`);
  root.style.setProperty("--dur-deliberate", `${DUR.deliberate}ms`);
  root.style.setProperty("--ease-out-expo", `cubic-bezier(${EASE_OUT_EXPO.join(",")})`);
  root.style.setProperty("--ease-out-quart", `cubic-bezier(${EASE_OUT_QUART.join(",")})`);
  root.style.setProperty("--ease-in-out-quart", `cubic-bezier(${EASE_IN_OUT_QUART.join(",")})`);
}
