import { describe, expect, it } from "vitest";
import { buildReflowActions, planOverdueReflow } from "../lib/kairoReflowTool";
import { createHandleRegistry, type HandleRegistry } from "../lib/kairoTools";
import type { MobileTask } from "../components/TaskCard";
import type { GoalItem } from "../lib/goalsStorage";
import type { Id } from "../../../../convex/_generated/dataModel";

const TODAY = "2026-06-03";

function task(id: string, scheduledDate: string, position: number): MobileTask {
  return {
    _id: id as Id<"tasks">,
    title: id,
    status: "scheduled",
    scheduledDate,
    position,
    updatedAt: position,
  };
}

function goal(id: string, deadline: string | undefined, priority?: "p1" | "p2" | "p3"): GoalItem {
  return { id, text: `Goal ${id}`, deadline, priority, createdAt: 1 };
}

function envFor(
  tasks: MobileTask[],
  goals: GoalItem[],
  goalLinks: Record<string, string>,
  registry: HandleRegistry = createHandleRegistry()
) {
  return { tasks, goals, goalLinks, today: TODAY, registry };
}

describe("planOverdueReflow", () => {
  it("previews a future-deadline goal as an even spread and registers handles", () => {
    const registry = createHandleRegistry();
    const tasks = [task("t1", "2026-06-01", 0), task("t2", "2026-06-02", 1)];
    const goals = [goal("g1", "2026-06-10", "p1")];
    const env = envFor(tasks, goals, { t1: "g1", t2: "g1" }, registry);

    const preview = planOverdueReflow(env);

    expect(preview.totalOverdue).toBe(2);
    expect(preview.goals).toHaveLength(1);
    const g = preview.goals[0];
    expect(g.mode).toBe("spread");
    // First task today, last on the deadline.
    expect(g.changes.map((c) => c.to)).toEqual(["2026-06-03", "2026-06-10"]);
    expect(g.exceedsDeadline).toBe(false);
    expect(g.suggestedDeadline).toBeNull();
    // Handles surfaced in the preview resolve back through the registry.
    expect(registry.taskIdMap[g.changes[0].handle]).toBe("t1");
    expect(registry.goalIdMap[g.goalHandle]).toBe("g1");
  });

  it("routes overdue tasks with no goal or no deadline to orphans", () => {
    const tasks = [
      task("t1", "2026-06-01", 0), // linked to a deadline goal → group
      task("t2", "2026-06-01", 1), // linked to a goal WITHOUT a deadline → orphan
      task("t3", "2026-06-01", 2), // no goal link → orphan
    ];
    const goals = [goal("g1", "2026-06-10"), goal("g2", undefined)];
    const env = envFor(tasks, goals, { t1: "g1", t2: "g2" });

    const preview = planOverdueReflow(env);

    expect(preview.goals).toHaveLength(1);
    expect(preview.orphans.map((o) => o.title).sort()).toEqual(["t2", "t3"]);
  });
});

describe("buildReflowActions", () => {
  it("emits reschedules for moved tasks and leaves a still-future deadline alone", () => {
    const tasks = [task("t1", "2026-06-01", 0), task("t2", "2026-06-02", 1)];
    const goals = [goal("g1", "2026-06-10", "p1")];
    const env = envFor(tasks, goals, { t1: "g1", t2: "g1" });

    const { actions, plan } = buildReflowActions(env, {});

    expect(actions).toHaveLength(2);
    expect(actions.every((a) => a.kind === "reschedule")).toBe(true);
    expect(plan.totalRescheduled).toBe(2);
    expect(plan.goals[0].deadlineMoved).toBe(false);
  });

  it("marches a passed-deadline goal from today and moves its deadline by default", () => {
    const tasks = [task("t1", "2026-06-01", 0), task("t2", "2026-06-02", 1)];
    const goals = [goal("g1", "2026-05-30", "p1")]; // deadline already passed
    const env = envFor(tasks, goals, { t1: "g1", t2: "g1" });

    const { actions, plan } = buildReflowActions(env, {});

    const reschedules = actions.filter((a) => a.kind === "reschedule");
    const goalUpdates = actions.filter((a) => a.kind === "updateGoal");
    expect(reschedules.map((a) => (a.kind === "reschedule" ? a.scheduledDate : ""))).toEqual([
      "2026-06-03",
      "2026-06-04",
    ]);
    expect(goalUpdates).toHaveLength(1);
    expect(plan.goals[0].mode).toBe("march");
    expect(plan.goals[0].deadlineMoved).toBe(true);
  });

  it("never touches deadlines when extendDeadlines is false", () => {
    const tasks = [task("t1", "2026-06-01", 0)];
    const goals = [goal("g1", "2026-05-30", "p1")];
    const env = envFor(tasks, goals, { t1: "g1" });

    const { actions } = buildReflowActions(env, { extendDeadlines: false });

    expect(actions.some((a) => a.kind === "updateGoal")).toBe(false);
  });

  it("scopes the reflow to a single goal handle", () => {
    const registry = createHandleRegistry();
    const tasks = [task("t1", "2026-06-01", 0), task("t2", "2026-06-01", 1)];
    const goals = [goal("g1", "2026-06-10", "p1"), goal("g2", "2026-06-10", "p1")];
    const env = envFor(tasks, goals, { t1: "g1", t2: "g2" }, registry);

    // Seed handles so the scoping arg resolves (mirrors what the preview does).
    planOverdueReflow(env);
    const g2Handle = Object.keys(registry.goalIdMap).find(
      (h) => registry.goalIdMap[h] === "g2"
    )!;

    const { plan } = buildReflowActions(env, { goalHandle: g2Handle });
    expect(plan.goals).toHaveLength(1);
    expect(plan.goals[0].goal).toBe("Goal g2");
  });
});
