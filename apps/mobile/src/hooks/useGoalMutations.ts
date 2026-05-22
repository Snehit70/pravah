import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { goalsStore, type GoalDraft } from "../lib/goalsStorage";
import { goalLinksStore } from "../lib/goalLinks";

export function useGoalMutations() {
  const upsertGoalMutation = useMutation(api.goals.upsert);
  const removeGoalMutation = useMutation(api.goals.remove);
  const setLinkMutation = useMutation(api.goals.setLink);
  const clearAllMutation = useMutation(api.goals.clearAll);

  const addGoal = useCallback(
    async (draft: GoalDraft | string) => {
      const goal = await goalsStore.add(draft);
      if (!goal) return null;
      void upsertGoalMutation({
        clientId: goal.id,
        text: goal.text,
        description: goal.description,
        deadline: goal.deadline,
        priority: goal.priority,
        createdAt: goal.createdAt ?? Date.now(),
      });
      return goal;
    },
    [upsertGoalMutation],
  );

  const deleteGoal = useCallback(
    (id: string) => {
      goalLinksStore.clearGoal(id);
      goalsStore.remove(id);
      void removeGoalMutation({ clientId: id });
    },
    [removeGoalMutation],
  );

  const setGoalLink = useCallback(
    (taskId: string, goalId: string | null) => {
      goalLinksStore.setLink(taskId, goalId);
      void setLinkMutation({ taskId, goalClientId: goalId });
    },
    [setLinkMutation],
  );

  const clearAll = useCallback(() => {
    goalsStore.reset();
    goalLinksStore.reset();
    void clearAllMutation();
  }, [clearAllMutation]);

  return { addGoal, deleteGoal, setGoalLink, clearAll };
}
