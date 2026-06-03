import { describe, expect, it } from "vitest";
import {
  bucketOverdue,
  computeReflow,
  daysBetween,
  type ReflowGroup,
} from "../features/overdue-triage/reflow";
import type { MobileTask } from "../components/TaskCard";
import type { GoalItem } from "../lib/goalsStorage";
import type { Id } from "../../../../convex/_generated/dataModel";

const TODAY = "2026-06-03";

function task(partial: Partial<MobileTask> & { id: string }): MobileTask {
  const { id, ...rest } = partial;
  return {
    _id: id as unknown as Id<"tasks">,
    title: rest.title ?? id,
    status: rest.status ?? "scheduled",
    position: rest.position ?? 0,
    updatedAt: 0,
    ...rest,
  } as MobileTask;
}

const goalPassed: GoalItem = {
  id: "g1",
  text: "Classical ML",
  deadline: "2026-05-24", // already passed relative to TODAY
  priority: "p1",
};
const goalFuture: GoalItem = {
  id: "g2",
  text: "Deep Learning",
  deadline: "2026-06-30",
  priority: "p2",
};
const goalNoDeadline: GoalItem = { id: "g3", text: "Blog", priority: "p3" };

describe("daysBetween", () => {
  it("counts forward and backward", () => {
    expect(daysBetween("2026-06-03", "2026-06-10")).toBe(7);
    expect(daysBetween("2026-06-03", "2026-06-03")).toBe(0);
    expect(daysBetween("2026-06-03", "2026-05-24")).toBe(-10);
  });
});

describe("bucketOverdue", () => {
  const tasks = [
    task({ id: "a1", scheduledDate: "2026-05-28", position: 1 }), // g1 overdue
    task({ id: "a2", scheduledDate: "2026-05-30", position: 2 }), // g1 overdue
    task({ id: "a3", scheduledDate: "2026-06-20", position: 3 }), // g1 future (in plan, not overdue)
    task({ id: "a4", scheduledDate: "2026-05-29" }), // g3 (no deadline) -> orphan
    task({ id: "a5", scheduledDate: "2026-05-29" }), // no goal -> orphan
    task({ id: "a6", scheduledDate: "2026-05-10", status: "completed" }), // ignored
    task({ id: "a7", scheduledDate: "2026-06-25" }), // g2 future, not overdue -> no group
  ];
  const links: Record<string, string> = {
    a1: "g1",
    a2: "g1",
    a3: "g1",
    a4: "g3",
    a7: "g2",
  };
  const buckets = bucketOverdue(tasks, links, [goalPassed, goalFuture, goalNoDeadline], TODAY);

  it("counts only overdue scheduled tasks", () => {
    expect(buckets.totalOverdue).toBe(4); // a1,a2,a4,a5 (a6 completed, a3/a7 future)
  });

  it("creates a group only for goals with a deadline that have overdue tasks", () => {
    expect(buckets.groups.map((g) => g.goal.id)).toEqual(["g1"]);
  });

  it("includes the whole remaining scheduled plan in the group, not just overdue", () => {
    const g1 = buckets.groups[0];
    expect(g1.planTasks.map((t) => String(t._id))).toEqual(["a1", "a2", "a3"]);
    expect(g1.overdueCount).toBe(2);
  });

  it("sorts a plan chronologically before using same-day positions", () => {
    const scrambled = bucketOverdue(
      [
        task({ id: "x1", scheduledDate: "2026-06-10", position: 0 }),
        task({ id: "x2", scheduledDate: "2026-05-28", position: 4 }),
        task({ id: "x3", scheduledDate: "2026-05-29", position: 1 }),
      ],
      { x1: "g1", x2: "g1", x3: "g1" },
      [goalPassed],
      TODAY
    );
    expect(scrambled.groups[0]?.planTasks.map((t) => String(t._id))).toEqual([
      "x2",
      "x3",
      "x1",
    ]);
  });

  it("routes no-goal and no-deadline-goal overdue tasks to orphans", () => {
    expect(buckets.orphans.map((t) => String(t._id)).sort()).toEqual(["a4", "a5"]);
  });
});

describe("computeReflow — march (deadline passed)", () => {
  const group: ReflowGroup = {
    goal: goalPassed,
    overdueCount: 3,
    planTasks: [
      task({ id: "a1", scheduledDate: "2026-05-20", position: 1 }),
      task({ id: "a2", scheduledDate: "2026-05-21", position: 2 }),
      task({ id: "a3", scheduledDate: "2026-05-22", position: 3 }),
    ],
  };
  const r = computeReflow(group, TODAY);

  it("lays tasks consecutively 1/day from today in position order", () => {
    expect(r.mode).toBe("march");
    expect(r.assignments).toEqual([
      { taskId: "a1", scheduledDate: "2026-06-03" },
      { taskId: "a2", scheduledDate: "2026-06-04" },
      { taskId: "a3", scheduledDate: "2026-06-05" },
    ]);
  });

  it("projects the end past the dead deadline and offers a new one", () => {
    expect(r.projectedEnd).toBe("2026-06-05");
    expect(r.exceedsDeadline).toBe(true);
    expect(r.suggestedDeadline).toBe("2026-06-05");
  });

  it("counts every task as moved (all were overdue)", () => {
    expect(r.movedCount).toBe(3);
    expect(r.futureMovedCount).toBe(0);
  });
});

describe("computeReflow — spread (future deadline, fits)", () => {
  const group: ReflowGroup = {
    goal: goalFuture,
    overdueCount: 1,
    planTasks: [
      task({ id: "b1", scheduledDate: "2026-05-30", position: 1 }), // overdue
      task({ id: "b2", scheduledDate: "2026-06-10", position: 2 }), // future, will move to 06-17
      task({ id: "b3", scheduledDate: "2026-06-30", position: 3 }), // future, already on deadline
    ],
  };
  const r = computeReflow(group, TODAY);

  it("spreads evenly with first task today and last on the deadline", () => {
    expect(r.mode).toBe("spread");
    expect(r.assignments[0]).toEqual({ taskId: "b1", scheduledDate: "2026-06-03" });
    expect(r.assignments[2]).toEqual({ taskId: "b3", scheduledDate: "2026-06-30" });
  });

  it("does not exceed or re-suggest the still-valid deadline", () => {
    expect(r.exceedsDeadline).toBe(false);
    expect(r.suggestedDeadline).toBeUndefined();
  });

  it("flags future tasks that get moved", () => {
    // b3 stays on 2026-06-30 (unchanged); b1 and b2 move. b2 was future.
    expect(r.movedCount).toBe(2);
    expect(r.futureMovedCount).toBe(1);
  });
});

describe("computeReflow — march (future deadline but too many tasks)", () => {
  // 5 tasks but only 3 days until the deadline -> doesn't fit -> march.
  const planTasks = Array.from({ length: 5 }, (_, i) =>
    task({ id: `c${i}`, scheduledDate: "2026-05-25", position: i })
  );
  const group: ReflowGroup = {
    goal: { id: "g4", text: "Crunch", deadline: "2026-06-05" },
    overdueCount: 5,
    planTasks,
  };
  const r = computeReflow(group, TODAY);

  it("falls back to a 1/day march and suggests a later deadline", () => {
    expect(r.mode).toBe("march");
    expect(r.projectedEnd).toBe("2026-06-07"); // today + 4
    expect(r.exceedsDeadline).toBe(true);
    expect(r.suggestedDeadline).toBe("2026-06-07");
  });
});

describe("computeReflow — single task", () => {
  it("places one task on today", () => {
    const group: ReflowGroup = {
      goal: goalFuture,
      overdueCount: 1,
      planTasks: [task({ id: "d1", scheduledDate: "2026-05-01", position: 0 })],
    };
    const r = computeReflow(group, TODAY);
    expect(r.assignments).toEqual([{ taskId: "d1", scheduledDate: "2026-06-03" }]);
  });
});
