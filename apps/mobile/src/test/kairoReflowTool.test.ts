import { describe, expect, it } from "vitest";
import { buildReflowApply, planOverdueReflow } from "../lib/kairoReflowTool";
import { createHandleRegistry } from "../lib/kairoTools";
import type { OverduePreviewData } from "../features/overdue-triage/types";

const TODAY = "2026-06-03";

function preview(overrides?: Partial<OverduePreviewData>): OverduePreviewData {
  return {
    totalOverdue: 2,
    planToken: "all-token",
    groups: [
      {
        goalId: "g1",
        goalText: "Ship beta",
        goalDeadline: "2026-06-10",
        overdueCount: 2,
        movedCount: 2,
        futureMovedCount: 0,
        mode: "spread",
        projectedEnd: "2026-06-10",
        suggestedDeadline: undefined,
        defaultApplyDeadline: false,
        assignments: [
          { taskId: "t1", scheduledDate: "2026-06-03" },
          { taskId: "t2", scheduledDate: "2026-06-10" },
        ],
        planToken: "g1-token",
        tasks: [
          {
            taskId: "t1",
            title: "Task 1",
            currentDate: "2026-06-01",
            nextDate: "2026-06-03",
            changed: true,
          },
          {
            taskId: "t2",
            title: "Task 2",
            currentDate: "2026-06-02",
            nextDate: "2026-06-10",
            changed: true,
          },
        ],
      },
    ],
    orphans: [{ taskId: "t9", title: "Loose task", scheduledDate: "2026-06-01" }],
    ...overrides,
  };
}

describe("planOverdueReflow", () => {
  it("converts canonical preview data into Kairo handles", () => {
    const registry = createHandleRegistry();
    const result = planOverdueReflow({
      preview: preview(),
      today: TODAY,
      registry,
    });

    expect(result.totalOverdue).toBe(2);
    expect(result.goals).toHaveLength(1);
    expect(result.goals[0]?.changes.map((change) => change.to)).toEqual([
      "2026-06-03",
      "2026-06-10",
    ]);
    expect(registry.goalIdMap[result.goals[0]?.goalHandle ?? ""]).toBe("g1");
    expect(registry.taskIdMap[result.orphans[0]?.handle ?? ""]).toBe("t9");
  });
});

describe("buildReflowApply", () => {
  it("uses the single-goal token when scoped to one handle", () => {
    const registry = createHandleRegistry();
    const env = { preview: preview(), today: TODAY, registry };
    const planned = planOverdueReflow(env);
    const goalHandle = planned.goals[0]?.goalHandle ?? "";

    const result = buildReflowApply(env, { goalHandle });

    expect(result.planToken).toBe("g1-token");
    expect(result.plan.totalRescheduled).toBe(2);
  });

  it("moves deadlines only for groups that request it", () => {
    const registry = createHandleRegistry();
    const env = {
      preview: preview({
        groups: [
          {
            ...preview().groups[0],
            goalId: "g1",
            goalText: "Goal 1",
            suggestedDeadline: "2026-06-05",
            defaultApplyDeadline: true,
            planToken: "g1-token",
          },
          {
            ...preview().groups[0],
            goalId: "g2",
            goalText: "Goal 2",
            suggestedDeadline: "2026-06-08",
            defaultApplyDeadline: false,
            planToken: "g2-token",
          },
        ],
      }),
      today: TODAY,
      registry,
    };

    const result = buildReflowApply(env, {});

    expect(result.planToken).toBe("all-token");
    expect(result.goalIdsToMoveDeadlines).toEqual(["g1"]);
    expect(result.plan.goals.map((goal) => goal.deadlineMoved)).toEqual([true, false]);
  });
});
