import type { ConfirmOptions } from "../hooks/useConfirm";

/** Server answer to a settle request (mirrors convex/goalSettleModel.ts). */
export type SettleGoalResult =
  | { status: "settled"; completedAt: number; completedTaskCount: number }
  | { status: "open_tasks"; openTaskCount: number }
  | { status: "not_found" };

export type SettleGoalFn = (
  goalId: string,
  options?: { completeOpenTasks: true; expectedOpenTaskCount: number },
) => Promise<SettleGoalResult>;

export type SettleOutcome =
  | { kind: "settled"; completedTaskCount: number }
  | { kind: "cancelled" }
  | { kind: "not_found" };

export function isGoalSettled(goal: { completedAt?: number }): boolean {
  return typeof goal.completedAt === "number";
}

/**
 * Settled goals sink below open ones; order inside each group is kept, so
 * this composes with any priority/created sort applied first.
 */
export function partitionSettledLast<T extends { completedAt?: number }>(goals: T[]): T[] {
  return [...goals.filter((g) => !isGoalSettled(g)), ...goals.filter(isGoalSettled)];
}

export function settleConfirmOptions(goalText: string, openTaskCount: number): ConfirmOptions {
  const one = openTaskCount === 1;
  const tasks = one ? "1 open task" : `${openTaskCount} open tasks`;
  return {
    title: `Complete ${tasks} and settle?`,
    message: `${goalText}\n\n${one ? "Its 1 open task" : `All ${openTaskCount} open tasks`} will be marked done with the goal. Reopening the goal later keeps them done.`,
    confirmLabel: `Complete ${openTaskCount} & settle`,
    cancelLabel: "Keep open",
    destructive: true,
  };
}

/**
 * Mark a goal done. When the server reports open tasks, ask the user once
 * with the exact count; the confirmed count goes back so a task added in the
 * meantime triggers a fresh question instead of being completed silently.
 */
export async function settleGoalWithConfirm({
  goalId,
  goalText,
  settle,
  confirm,
}: {
  goalId: string;
  goalText: string;
  settle: SettleGoalFn;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}): Promise<SettleOutcome> {
  let result = await settle(goalId);
  // Bounded: each extra round needs the open count to change under the user.
  for (let attempt = 0; attempt < 3 && result.status === "open_tasks"; attempt += 1) {
    const count = result.openTaskCount;
    if (!(await confirm(settleConfirmOptions(goalText, count)))) return { kind: "cancelled" };
    result = await settle(goalId, { completeOpenTasks: true, expectedOpenTaskCount: count });
  }
  if (result.status === "settled") return { kind: "settled", completedTaskCount: result.completedTaskCount };
  if (result.status === "not_found") return { kind: "not_found" };
  return { kind: "cancelled" };
}
