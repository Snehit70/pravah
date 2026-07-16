/**
 * goalTasks
 *
 * Ordering for the tasks linked to a goal. The goal sheet is a workbench: it
 * answers "what is left on this goal, and in what order will I hit it". That
 * makes `deadline` the spine — the field the Timeline already groups by — with
 * authored order (`createdAt`) as the tiebreaker, so an undated pile of
 * "Milestone 1..8" keeps the sequence it was written in.
 *
 * Deliberately not `updatedAt`, which the sheet used to sort by: last-touched
 * order means acting on a task moves it, so the list reshuffles under the hands
 * doing the work, and the two things you just finished sit at the top.
 */

import type { MobileTask } from "../components/TaskCard";
import { compareTasksWithinDay, taskPlacement } from "./taskLifecycle";

export type GoalTaskGroupKey = "overdue" | "today" | "later" | "nodate";

export type GoalTaskGroup = {
  key: GoalTaskGroupKey;
  label: string;
  tasks: MobileTask[];
};

export type GoalTaskGroups = {
  /** Open work, in the order it will be hit. Empty groups are omitted. */
  groups: GoalTaskGroup[];
  /** Finished work, freshest first — evidence, not workbench. */
  done: MobileTask[];
};

const GROUP_LABEL: Record<GoalTaskGroupKey, string> = {
  overdue: "Overdue",
  today: "Today",
  later: "Later",
  nodate: "No date",
};

const GROUP_ORDER: readonly GoalTaskGroupKey[] = ["overdue", "today", "later", "nodate"];

function openGroupKey(task: MobileTask, todayIso: string): GoalTaskGroupKey {
  if (!task.deadline) return "nodate";
  if (task.deadline < todayIso) return "overdue";
  if (task.deadline === todayIso) return "today";
  return "later";
}

/** Deadline, then time-of-day inside that day, then the order it was written. */
function compareOpen(a: MobileTask, b: MobileTask): number {
  const aDeadline = a.deadline ?? "";
  const bDeadline = b.deadline ?? "";
  if (aDeadline !== bDeadline) return aDeadline.localeCompare(bDeadline);
  return compareTasksWithinDay(a, b) || a.createdAt - b.createdAt;
}

function finishedAt(task: MobileTask): number {
  return task.completedAt ?? task.cancelledAt ?? 0;
}

/**
 * Split a goal's linked tasks into ordered open groups plus a finished pile.
 *
 * Cancelled tasks land in `done` alongside completed ones: neither is work the
 * workbench can act on, and leaving an abandoned task sitting in "No date"
 * would read as something still owed.
 */
export function groupLinkedTasks(linked: MobileTask[], todayIso: string): GoalTaskGroups {
  const buckets = new Map<GoalTaskGroupKey, MobileTask[]>();
  const done: MobileTask[] = [];

  for (const task of linked) {
    const placement = taskPlacement(task);
    if (placement === "completed" || placement === "cancelled") {
      done.push(task);
      continue;
    }
    const key = openGroupKey(task, todayIso);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(task);
    else buckets.set(key, [task]);
  }

  const groups: GoalTaskGroup[] = [];
  for (const key of GROUP_ORDER) {
    const tasks = buckets.get(key);
    if (!tasks || tasks.length === 0) continue;
    tasks.sort(compareOpen);
    groups.push({ key, label: GROUP_LABEL[key], tasks });
  }

  done.sort((a, b) => finishedAt(b) - finishedAt(a));

  return { groups, done };
}
