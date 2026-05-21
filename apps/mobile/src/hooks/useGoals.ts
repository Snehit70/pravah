/**
 * Thin useSyncExternalStore wrappers around goalsStore + goalLinksStore.
 * Any screen that needs goals or goal links subscribes through these so
 * adds/deletes propagate without prop-drilling.
 */

import { useSyncExternalStore } from "react";
import { goalsStore, type GoalItem } from "../lib/goalsStorage";
import { goalLinksStore, type GoalLinkMap } from "../lib/goalLinks";

export function useGoals(): { goals: GoalItem[]; isHydrated: boolean } {
  const goals = useSyncExternalStore(
    goalsStore.subscribe,
    goalsStore.get,
    goalsStore.get,
  );
  return { goals, isHydrated: goalsStore.isHydrated() };
}

export function useGoalLinks(): GoalLinkMap {
  return useSyncExternalStore(
    goalLinksStore.subscribe,
    goalLinksStore.get,
    goalLinksStore.get,
  );
}
