import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { requireTokenIdentifier } from "./authHelpers";

type ReflowCtx = QueryCtx | MutationCtx;
type TaskDoc = Doc<"tasks">;
type GoalDoc = Doc<"goals">;
type GoalLinkDoc = Doc<"goalLinks">;

type PlanGoalSummary = {
  goalId: string;
  goalText: string;
  goalDeadline?: string;
  overdueCount: number;
  movedCount: number;
  futureMovedCount: number;
  mode: "spread" | "march";
  projectedEnd: string;
  suggestedDeadline?: string;
  defaultApplyDeadline: boolean;
  assignments: Array<{ taskId: string; scheduledDate: string }>;
  tasks: Array<{
    taskId: string;
    title: string;
    currentDate?: string;
    nextDate: string;
    changed: boolean;
  }>;
  planToken: string;
};

type GoalSummaryForToken = {
  goalId: string;
  goalText: string;
  beforeDeadline?: string;
  suggestedDeadline?: string;
};

type TaskSummaryForToken = {
  taskId: Id<"tasks">;
  title: string;
  type: "open" | "deadline";
  deadline?: string;
  beforeDate: string;
  beforePosition: number;
  afterDate: string;
  afterPosition: number;
};

type DateLaneSnapshot = {
  date: string;
  entries: Array<{ taskId: Id<"tasks">; position: number }>;
};

type EncodedPlan = {
  ownerTokenIdentifier: string;
  createdAt: number;
  goals: GoalSummaryForToken[];
  tasks: TaskSummaryForToken[];
  dateStatesBefore: DateLaneSnapshot[];
};

type AppliedGoalSnapshot = {
  goalId: string;
  text: string;
  beforeDeadline?: string;
  afterDeadline?: string;
};

type AppliedTaskSnapshot = {
  taskId: Id<"tasks">;
  title: string;
  beforeDate: string;
  beforePosition: number;
  afterDate: string;
  afterPosition: number;
};

type ReflowResult = {
  assignments: Array<{ taskId: string; scheduledDate: string }>;
  movedCount: number;
  futureMovedCount: number;
  projectedEnd: string;
  mode: "spread" | "march";
  exceedsDeadline: boolean;
  suggestedDeadline?: string;
};

type ReflowGroup = {
  goal: {
    id: string;
    text: string;
    deadline?: string;
    priority?: "p1" | "p2" | "p3";
  };
  overdueCount: number;
  planTasks: TaskDoc[];
};

type OverdueBuckets = {
  groups: ReflowGroup[];
  orphans: TaskDoc[];
  totalOverdue: number;
};

const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addIso(iso: string, days: number): string {
  const date = parseIsoLocal(iso);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function daysBetween(a: string, b: string): number {
  const ms = parseIsoLocal(b).getTime() - parseIsoLocal(a).getTime();
  return Math.round(ms / 86_400_000);
}

function comparePlan(a: TaskDoc, b: TaskDoc): number {
  const ad = a.scheduledDate ?? "";
  const bd = b.scheduledDate ?? "";
  if (ad !== bd) return ad < bd ? -1 : 1;
  if (a.position !== b.position) return a.position - b.position;
  return String(a._id) < String(b._id) ? -1 : 1;
}

function compareLane(a: { position: number; taskId: string }, b: { position: number; taskId: string }) {
  if (a.position !== b.position) return a.position - b.position;
  return a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0;
}

function isOverdue(task: TaskDoc, today: string): boolean {
  return task.status === "scheduled" && !!task.scheduledDate && task.scheduledDate < today;
}

function clampAssignmentDate(task: TaskDoc, scheduledDate: string, today: string): string {
  if (
    task.type === "deadline" &&
    task.deadline &&
    scheduledDate > task.deadline &&
    task.deadline >= today
  ) {
    return task.deadline;
  }
  return scheduledDate;
}

async function loadOwnedState(ctx: ReflowCtx, tokenIdentifier: string) {
  const [goals, goalLinks, tasks] = await Promise.all([
    ctx.db
      .query("goals")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect(),
    ctx.db
      .query("goalLinks")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect(),
    ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect(),
  ]);

  return { goals, goalLinks, tasks };
}

function bucketOverdue(
  tasks: TaskDoc[],
  goalLinks: GoalLinkDoc[],
  goals: GoalDoc[],
  today: string
): OverdueBuckets {
  const goalById = new Map(
    goals.map((goal) => [
      goal.clientId,
      {
        id: goal.clientId,
        text: goal.text,
        deadline: goal.deadline,
        priority: goal.priority,
      },
    ])
  );
  const goalLinkByTaskId = new Map(goalLinks.map((link) => [link.taskId, link.goalClientId]));
  const overdue = tasks.filter((task) => isOverdue(task, today));

  const orphans: TaskDoc[] = [];
  const overdueGoalIds = new Set<string>();

  for (const task of overdue) {
    const goalId = goalLinkByTaskId.get(String(task._id));
    const goal = goalId ? goalById.get(goalId) : undefined;
    if (goal && goal.deadline) overdueGoalIds.add(goal.id);
    else orphans.push(task);
  }

  const groups: ReflowGroup[] = [];
  for (const goalId of overdueGoalIds) {
    const goal = goalById.get(goalId);
    if (!goal) continue;
    const planTasks = tasks
      .filter(
        (task) =>
          goalLinkByTaskId.get(String(task._id)) === goalId &&
          task.status === "scheduled" &&
          !!task.scheduledDate
      )
      .sort(comparePlan);
    const overdueCount = planTasks.filter((task) => isOverdue(task, today)).length;
    groups.push({ goal, overdueCount, planTasks });
  }

  groups.sort((a, b) => {
    const pa = PRIORITY_RANK[a.goal.priority ?? ""] ?? 3;
    const pb = PRIORITY_RANK[b.goal.priority ?? ""] ?? 3;
    if (pa !== pb) return pa - pb;
    const da = a.goal.deadline ?? "";
    const db = b.goal.deadline ?? "";
    return da < db ? -1 : da > db ? 1 : 0;
  });

  return { groups, orphans, totalOverdue: overdue.length };
}

function computeReflow(group: ReflowGroup, today: string): ReflowResult {
  const tasks = group.planTasks;
  const n = tasks.length;
  const deadline = group.goal.deadline ?? today;
  const daysAvailable = daysBetween(today, deadline) + 1;
  const deadlineUsable = deadline >= today && n > 0 && n <= daysAvailable;

  const assignments: Array<{ taskId: string; scheduledDate: string }> = [];
  let mode: "spread" | "march";

  if (deadlineUsable) {
    mode = "spread";
    const span = daysAvailable - 1;
    for (let i = 0; i < n; i += 1) {
      const offset = n === 1 ? 0 : Math.round((i * span) / (n - 1));
      assignments.push({
        taskId: String(tasks[i]._id),
        scheduledDate: clampAssignmentDate(tasks[i], addIso(today, offset), today),
      });
    }
  } else {
    mode = "march";
    for (let i = 0; i < n; i += 1) {
      assignments.push({
        taskId: String(tasks[i]._id),
        scheduledDate: clampAssignmentDate(tasks[i], addIso(today, i), today),
      });
    }
  }

  const projectedEnd = assignments.reduce(
    (max, assignment) => (assignment.scheduledDate > max ? assignment.scheduledDate : max),
    today
  );
  const exceedsDeadline = projectedEnd > deadline;
  const suggestedDeadline = deadline < today || exceedsDeadline ? projectedEnd : undefined;

  const oldById = new Map(tasks.map((task) => [String(task._id), task.scheduledDate]));
  let movedCount = 0;
  let futureMovedCount = 0;
  for (const assignment of assignments) {
    const old = oldById.get(assignment.taskId);
    if (old !== assignment.scheduledDate) {
      movedCount += 1;
      if (old && old >= today) futureMovedCount += 1;
    }
  }

  return {
    assignments,
    movedCount,
    futureMovedCount,
    projectedEnd,
    mode,
    exceedsDeadline,
    suggestedDeadline,
  };
}

function buildDateState(tasks: TaskDoc[], dates: Set<string>): DateLaneSnapshot[] {
  return [...dates]
    .sort()
    .map((date) => ({
      date,
      entries: tasks
        .filter(
          (task) =>
            task.status === "scheduled" &&
            task.scheduledDate === date &&
            typeof task.position === "number"
        )
        .map((task) => ({ taskId: task._id, position: task.position }))
        .sort((a, b) => compareLane({ ...a, taskId: String(a.taskId) }, { ...b, taskId: String(b.taskId) })),
    }));
}

function buildAfterTasks(
  allTasks: TaskDoc[],
  assignmentRows: Array<{ taskId: Id<"tasks">; scheduledDate: string }>
): Map<string, { scheduledDate: string; position: number }> {
  const affectedIds = new Set(assignmentRows.map((row) => String(row.taskId)));
  const assignmentsByDate = new Map<string, Array<{ taskId: Id<"tasks">; order: number }>>();

  assignmentRows.forEach((row, order) => {
    const bucket = assignmentsByDate.get(row.scheduledDate) ?? [];
    bucket.push({ taskId: row.taskId, order });
    assignmentsByDate.set(row.scheduledDate, bucket);
  });

  const unaffectedMaxPositionByDate = new Map<string, number>();
  for (const task of allTasks) {
    if (
      task.status !== "scheduled" ||
      !task.scheduledDate ||
      affectedIds.has(String(task._id))
    ) {
      continue;
    }
    const current = unaffectedMaxPositionByDate.get(task.scheduledDate) ?? -1;
    if (task.position > current) unaffectedMaxPositionByDate.set(task.scheduledDate, task.position);
  }

  const afterByTaskId = new Map<string, { scheduledDate: string; position: number }>();
  for (const [date, rows] of assignmentsByDate) {
    const start = (unaffectedMaxPositionByDate.get(date) ?? -1) + 1;
    rows
      .sort((a, b) => a.order - b.order)
      .forEach((row, index) => {
        afterByTaskId.set(String(row.taskId), {
          scheduledDate: date,
          position: start + index,
        });
      });
  }
  return afterByTaskId;
}

function encodePlan(plan: EncodedPlan): string {
  return JSON.stringify(plan);
}

function decodePlan(planToken: string): EncodedPlan {
  return JSON.parse(planToken) as EncodedPlan;
}

function assertDateStateMatches(currentTasks: TaskDoc[], expected: DateLaneSnapshot[], label: string) {
  const currentByDate = new Map<string, Array<{ taskId: string; position: number }>>();
  for (const task of currentTasks) {
    if (task.status !== "scheduled" || !task.scheduledDate) continue;
    const bucket = currentByDate.get(task.scheduledDate) ?? [];
    bucket.push({ taskId: String(task._id), position: task.position });
    currentByDate.set(task.scheduledDate, bucket);
  }

  for (const snapshot of expected) {
    const current = (currentByDate.get(snapshot.date) ?? []).sort(compareLane);
    if (current.length !== snapshot.entries.length) {
      throw new Error(`${label} changed after preview`);
    }
    for (let index = 0; index < snapshot.entries.length; index += 1) {
      const expectedEntry = snapshot.entries[index];
      const currentEntry = current[index];
      if (
        !currentEntry ||
        currentEntry.taskId !== String(expectedEntry.taskId) ||
        currentEntry.position !== expectedEntry.position
      ) {
        throw new Error(`${label} changed after preview`);
      }
    }
  }
}

function validateTaskEligibility(task: TaskDoc | null): asserts task is TaskDoc {
  if (!task) throw new Error("A task no longer exists");
  if (task.status === "completed" || task.status === "cancelled") {
    throw new Error("A task is no longer eligible for reflow");
  }
  if (task.status !== "scheduled" || !task.scheduledDate) {
    throw new Error("A task is no longer scheduled");
  }
}

function buildPlanPayload(
  tokenIdentifier: string,
  goals: GoalSummaryForToken[],
  tasks: TaskSummaryForToken[],
  dateStatesBefore: DateLaneSnapshot[]
) {
  return encodePlan({
    ownerTokenIdentifier: tokenIdentifier,
    createdAt: Date.now(),
    goals,
    tasks,
    dateStatesBefore,
  });
}

function summarizeGroup(
  tokenIdentifier: string,
  group: ReflowGroup,
  result: ReflowResult,
  allTasks: TaskDoc[],
  today: string
): PlanGoalSummary {
  const assignmentRows = result.assignments.map((assignment) => ({
    taskId: assignment.taskId as Id<"tasks">,
    scheduledDate: assignment.scheduledDate,
  }));
  const relevantTasks = group.planTasks;
  const afterByTaskId = buildAfterTasks(
    allTasks,
    assignmentRows
  );

  const touchedDates = new Set<string>();
  const tokenTasks: TaskSummaryForToken[] = relevantTasks.map((task) => {
    const after = afterByTaskId.get(String(task._id));
    if (!after || !task.scheduledDate) {
      throw new Error("Could not build reflow preview");
    }
    touchedDates.add(task.scheduledDate);
    touchedDates.add(after.scheduledDate);
    return {
      taskId: task._id,
      title: task.title,
      type: task.type,
      deadline: task.deadline,
      beforeDate: task.scheduledDate,
      beforePosition: task.position,
      afterDate: after.scheduledDate,
      afterPosition: after.position,
    };
  });

  const tokenGoals: GoalSummaryForToken[] = [
    {
      goalId: group.goal.id,
      goalText: group.goal.text,
      beforeDeadline: group.goal.deadline,
      suggestedDeadline: result.suggestedDeadline,
    },
  ];

  return {
    goalId: group.goal.id,
    goalText: group.goal.text,
    goalDeadline: group.goal.deadline,
    overdueCount: group.overdueCount,
    movedCount: result.movedCount,
    futureMovedCount: result.futureMovedCount,
    mode: result.mode,
    projectedEnd: result.projectedEnd,
    suggestedDeadline: result.suggestedDeadline,
    defaultApplyDeadline: Boolean(
      group.goal.deadline && group.goal.deadline < today && result.suggestedDeadline
    ),
    assignments: result.assignments,
    tasks: group.planTasks.map((task) => {
      const next = result.assignments.find((assignment) => assignment.taskId === String(task._id));
      const nextDate = next?.scheduledDate ?? task.scheduledDate ?? "";
      return {
        taskId: String(task._id),
        title: task.title,
        currentDate: task.scheduledDate,
        nextDate,
        changed: nextDate !== task.scheduledDate,
      };
    }),
    planToken: buildPlanPayload(
      tokenIdentifier,
      tokenGoals,
      tokenTasks,
      buildDateState(allTasks, touchedDates)
    ),
  };
}

export const preview = query({
  args: {
    today: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const { goals, goalLinks, tasks } = await loadOwnedState(ctx, tokenIdentifier);
    const buckets = bucketOverdue(tasks, goalLinks, goals, args.today);

    const groups = buckets.groups.map((group) =>
      summarizeGroup(tokenIdentifier, group, computeReflow(group, args.today), tasks, args.today)
    );

    const allAssignments = groups.flatMap((group) =>
      group.assignments.map((assignment) => ({
        taskId: assignment.taskId as Id<"tasks">,
        scheduledDate: assignment.scheduledDate,
      }))
    );

    const allTouchedTasks = tasks.filter((task) =>
      allAssignments.some((assignment) => String(assignment.taskId) === String(task._id))
    );
    const allAfterByTaskId = buildAfterTasks(tasks, allAssignments);
    const allTouchedDates = new Set<string>();
    const allTokenTasks: TaskSummaryForToken[] = allTouchedTasks.map((task) => {
      const after = allAfterByTaskId.get(String(task._id));
      if (!after || !task.scheduledDate) {
        throw new Error("Could not build reflow preview");
      }
      allTouchedDates.add(task.scheduledDate);
      allTouchedDates.add(after.scheduledDate);
      return {
        taskId: task._id,
        title: task.title,
        type: task.type,
        deadline: task.deadline,
        beforeDate: task.scheduledDate,
        beforePosition: task.position,
        afterDate: after.scheduledDate,
        afterPosition: after.position,
      };
    });

    const allTokenGoals: GoalSummaryForToken[] = groups.map((group) => ({
      goalId: group.goalId,
      goalText: group.goalText,
      beforeDeadline: group.goalDeadline,
      suggestedDeadline: group.suggestedDeadline,
    }));

    return {
      totalOverdue: buckets.totalOverdue,
      groups,
      orphans: buckets.orphans.map((task) => ({
        taskId: String(task._id),
        title: task.title,
        scheduledDate: task.scheduledDate,
      })),
      planToken: buildPlanPayload(
        tokenIdentifier,
        allTokenGoals,
        allTokenTasks,
        buildDateState(tasks, allTouchedDates)
      ),
    };
  },
});

export const apply = mutation({
  args: {
    planToken: v.string(),
    goalIdsToMoveDeadlines: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const plan = decodePlan(args.planToken);
    if (plan.ownerTokenIdentifier !== tokenIdentifier) {
      throw new Error("This reflow preview is no longer valid");
    }

    const moveDeadlineGoalIds = new Set(args.goalIdsToMoveDeadlines ?? []);
    const { goals, tasks } = await loadOwnedState(ctx, tokenIdentifier);
    const goalByClientId = new Map(goals.map((goal) => [goal.clientId, goal]));
    const taskById = new Map(tasks.map((task) => [String(task._id), task]));

    assertDateStateMatches(tasks, plan.dateStatesBefore, "Plan");

    for (const goalPlan of plan.goals) {
      const goal = goalByClientId.get(goalPlan.goalId);
      if (!goal) throw new Error("A goal no longer exists");
      if ((goal.deadline ?? undefined) !== goalPlan.beforeDeadline) {
        throw new Error("A goal changed after preview");
      }
      if (moveDeadlineGoalIds.has(goalPlan.goalId) && !goalPlan.suggestedDeadline) {
        throw new Error("This deadline move is no longer valid");
      }
    }

    for (const taskPlan of plan.tasks) {
      const task = taskById.get(String(taskPlan.taskId)) ?? null;
      validateTaskEligibility(task);
      if (task.scheduledDate !== taskPlan.beforeDate || task.position !== taskPlan.beforePosition) {
        throw new Error("A task changed after preview");
      }
      if (task.type !== taskPlan.type || (task.deadline ?? undefined) !== taskPlan.deadline) {
        throw new Error("A task changed after preview");
      }
    }

    const appliedTasks: AppliedTaskSnapshot[] = [];
    for (const taskPlan of plan.tasks) {
      await ctx.db.patch(taskPlan.taskId, {
        scheduledDate: taskPlan.afterDate,
        position: taskPlan.afterPosition,
        status: "scheduled",
        updatedAt: Date.now(),
      });
      appliedTasks.push({
        taskId: taskPlan.taskId,
        title: taskPlan.title,
        beforeDate: taskPlan.beforeDate,
        beforePosition: taskPlan.beforePosition,
        afterDate: taskPlan.afterDate,
        afterPosition: taskPlan.afterPosition,
      });
    }

    const appliedGoals: AppliedGoalSnapshot[] = [];
    for (const goalPlan of plan.goals) {
      const goal = goalByClientId.get(goalPlan.goalId);
      if (!goal) continue;
      const afterDeadline = moveDeadlineGoalIds.has(goalPlan.goalId)
        ? goalPlan.suggestedDeadline
        : goalPlan.beforeDeadline;
      if ((goal.deadline ?? undefined) !== afterDeadline) {
        await ctx.db.patch(goal._id, {
          deadline: afterDeadline,
          updatedAt: Date.now(),
        });
      }
      appliedGoals.push({
        goalId: goal.clientId,
        text: goal.text,
        beforeDeadline: goalPlan.beforeDeadline,
        afterDeadline,
      });
    }

    const refreshedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect();
    const touchedDatesAfter = new Set<string>();
    for (const task of appliedTasks) {
      touchedDatesAfter.add(task.beforeDate);
      touchedDatesAfter.add(task.afterDate);
    }
    const dateStatesAfter = buildDateState(refreshedTasks, touchedDatesAfter);

    const operationId =
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await ctx.db.insert("overdueReflowOperations", {
      ownerTokenIdentifier: tokenIdentifier,
      operationId,
      status: "applied",
      appliedAt: Date.now(),
      undoneAt: undefined,
      taskBefore: appliedTasks.map((task) => ({
        taskId: task.taskId,
        scheduledDate: task.beforeDate,
        position: task.beforePosition,
      })),
      taskAfter: appliedTasks.map((task) => ({
        taskId: task.taskId,
        scheduledDate: task.afterDate,
        position: task.afterPosition,
      })),
      goalBefore: appliedGoals.map((goal) => ({
        goalClientId: goal.goalId,
        deadline: goal.beforeDeadline,
      })),
      goalAfter: appliedGoals.map((goal) => ({
        goalClientId: goal.goalId,
        deadline: goal.afterDeadline,
      })),
      dateStatesBefore: plan.dateStatesBefore,
      dateStatesAfter,
    });

    return {
      operationId,
      taskCount: appliedTasks.length,
      goalDeadlineCount: appliedGoals.filter(
        (goal) => (goal.beforeDeadline ?? undefined) !== (goal.afterDeadline ?? undefined)
      ).length,
    };
  },
});

export const undo = mutation({
  args: {
    operationId: v.string(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const operation = await ctx.db
      .query("overdueReflowOperations")
      .withIndex("by_owner_operation_id", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("operationId", args.operationId)
      )
      .first();
    if (!operation || operation.status !== "applied") {
      throw new Error("This reflow can no longer be undone");
    }

    const latestApplied = await ctx.db
      .query("overdueReflowOperations")
      .withIndex("by_owner_applied_at", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .order("desc")
      .first();
    if (!latestApplied || latestApplied.operationId !== operation.operationId || latestApplied.status !== "applied") {
      throw new Error("Only the latest reflow can be undone");
    }

    const { goals, tasks } = await loadOwnedState(ctx, tokenIdentifier);
    const goalByClientId = new Map(goals.map((goal) => [goal.clientId, goal]));
    const taskById = new Map(tasks.map((task) => [String(task._id), task]));

    assertDateStateMatches(tasks, operation.dateStatesAfter, "Plan");

    for (const taskState of operation.taskAfter) {
      const task = taskById.get(String(taskState.taskId)) ?? null;
      validateTaskEligibility(task);
      if (task.scheduledDate !== taskState.scheduledDate || task.position !== taskState.position) {
        throw new Error("Plan changed after reflow");
      }
    }

    for (const goalState of operation.goalAfter) {
      const goal = goalByClientId.get(goalState.goalClientId);
      if (!goal || (goal.deadline ?? undefined) !== goalState.deadline) {
        throw new Error("Plan changed after reflow");
      }
    }

    for (const taskState of operation.taskBefore) {
      await ctx.db.patch(taskState.taskId, {
        scheduledDate: taskState.scheduledDate,
        position: taskState.position,
        status: "scheduled",
        updatedAt: Date.now(),
      });
    }

    for (const goalState of operation.goalBefore) {
      const goal = goalByClientId.get(goalState.goalClientId);
      if (!goal) continue;
      await ctx.db.patch(goal._id, {
        deadline: goalState.deadline,
        updatedAt: Date.now(),
      });
    }

    await ctx.db.patch(operation._id, {
      status: "undone",
      undoneAt: Date.now(),
    });

    return {
      taskCount: operation.taskBefore.length,
      goalDeadlineCount: operation.goalBefore.filter(
        (goal, index) => goal.deadline !== operation.goalAfter[index]?.deadline
      ).length,
    };
  },
});
