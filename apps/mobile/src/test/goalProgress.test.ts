/**
 * goalProgress tests — the ratio math and "in motion" selection that the
 * Progress page shares with GoalsScreen.
 */

import { describe, expect, it } from "vitest";
import { computeGoalProgress, goalsInMotion } from "../lib/goalProgress";
import type { GoalItem } from "../lib/goalsStorage";
import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

function goal(id: string, over: Partial<GoalItem> = {}): GoalItem {
  return { id, text: `Goal ${id}`, createdAt: 1, ...over };
}

function task(id: string, completedAt?: number): MobileTask {
  return {
    _id: id as Id<"tasks">,
    title: id,
    scheduledAt: 1,
    completedAt,
    position: 0,
    updatedAt: completedAt ?? 1,
    createdAt: 1,
  };
}

describe("computeGoalProgress", () => {
  it("counts linked done/total per goal and drops orphan links", () => {
    const goals = [goal("g1"), goal("g2")];
    const tasks = [task("t1", 100), task("t2"), task("t3", 100)];
    const links = { t1: "g1", t2: "g1", t3: "g2", tDeleted: "g2" };
    const rows = computeGoalProgress(goals, links, tasks);
    const g1 = rows.find((r) => r.goal.id === "g1")!;
    const g2 = rows.find((r) => r.goal.id === "g2")!;
    expect(g1).toMatchObject({ total: 2, done: 1 });
    expect(g1.ratio).toBeCloseTo(0.5);
    // tDeleted points at a task not in the list -> ignored.
    expect(g2).toMatchObject({ total: 1, done: 1, ratio: 1 });
  });

  it("gives zero progress to goals with no links", () => {
    const rows = computeGoalProgress([goal("g1")], {}, []);
    expect(rows[0]).toMatchObject({ total: 0, done: 0, ratio: 0 });
  });
});

describe("goalsInMotion", () => {
  it("keeps only goals with in-flight linked tasks", () => {
    const rows = computeGoalProgress(
      [goal("done"), goal("motion"), goal("empty")],
      { a: "done", b: "motion", c: "motion" },
      [task("a", 100), task("b", 100), task("c")],
    );
    const motion = goalsInMotion(rows);
    expect(motion.map((r) => r.goal.id)).toEqual(["motion"]);
  });

  it("orders by nearest deadline, then priority", () => {
    const goals = [
      goal("later", { deadline: "2025-12-01" }),
      goal("soon", { deadline: "2025-06-20" }),
      goal("none", { priority: "p1" }),
    ];
    const links = { a: "later", b: "soon", c: "none" };
    const tasks = [task("a"), task("b"), task("c")];
    const motion = goalsInMotion(computeGoalProgress(goals, links, tasks));
    expect(motion.map((r) => r.goal.id)).toEqual(["soon", "later", "none"]);
  });
});
