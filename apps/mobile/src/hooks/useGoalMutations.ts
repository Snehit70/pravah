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
  const settleMutation = useMutation(api.goals.settle);
  const reopenMutation = useMutation(api.goals.reopen);

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

  const updateGoal = useCallback(
    (id: string, draft: GoalDraft) => {
      const goal = goalsStore.update(id, draft);
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

  const setGoalLink = useCallback(
    (taskId: string, goalId: string | null) => {
      goalLinksStore.setLink(taskId, goalId);
      void setLinkMutation({ taskId, goalClientId: goalId });
    },
    [setLinkMutation],
  );

  /**
   * Ask the server to settle a goal. It refuses while tasks are open and
   * reports how many; pass `completeOpenTasks` with that count once the user
   * has confirmed completing them.
   */
  const settleGoal = useCallback(
    async (
      id: string,
      options?: { completeOpenTasks: true; expectedOpenTaskCount: number },
    ) => {
      const result = await settleMutation({ clientId: id, ...options });
      if (result.status === "settled") goalsStore.setCompletedAt(id, result.completedAt);
      return result;
    },
    [settleMutation],
  );

  /** Reopen a settled goal. Its tasks stay as they are. */
  const reopenGoal = useCallback(
    async (id: string) => {
      const previous = goalsStore.get().find((g) => g.id === id)?.completedAt;
      goalsStore.setCompletedAt(id, undefined);
      try {
        await reopenMutation({ clientId: id });
      } catch (error) {
        goalsStore.setCompletedAt(id, previous);
        throw error;
      }
    },
    [reopenMutation],
  );

  const clearAll = useCallback(() => {
    goalsStore.reset();
    goalLinksStore.reset();
    void clearAllMutation();
  }, [clearAllMutation]);

  return { addGoal, updateGoal, deleteGoal, setGoalLink, settleGoal, reopenGoal, clearAll };
}
