/**
 * groupLinkedTasks ordering tests
 *
 * The goal sheet's list previously sorted by updatedAt — last-touched first —
 * so acting on a task moved it and the list reshuffled under the user. These
 * tests pin the replacement spine: deadline ascending, undated last in
 * authored order, finished tasks split out freshest-first.
 */

import { describe, expect, it } from "vitest";

import { groupLinkedTasks } from "../lib/goalTasks";
import type { MobileTask } from "../components/TaskCard";

const TODAY = "2026-07-16";

let seq = 0;
function task(overrides: Partial<MobileTask> & { title: string }): MobileTask {
  seq += 1;
  return {
    _id: `task-${seq}` as MobileTask["_id"],
    scheduledAt: 0,
    position: 0,
    updatedAt: 0,
    createdAt: seq,
    ...overrides,
  } as MobileTask;
}

const titles = (tasks: MobileTask[]) => tasks.map((t) => t.title);

describe("groupLinkedTasks", () => {
  it("buckets by deadline against today and omits empty groups", () => {
    const { groups } = groupLinkedTasks(
      [
        task({ title: "later", deadline: "2026-08-01" }),
        task({ title: "undated" }),
        task({ title: "today", deadline: TODAY }),
        task({ title: "overdue", deadline: "2026-07-01" }),
      ],
      TODAY
    );
    expect(groups.map((g) => g.key)).toEqual(["overdue", "today", "later", "nodate"]);
    expect(groups.map((g) => g.label)).toEqual(["Overdue", "Today", "Later", "No date"]);

    const { groups: sparse } = groupLinkedTasks([task({ title: "solo" })], TODAY);
    expect(sparse.map((g) => g.key)).toEqual(["nodate"]);
  });

  it("orders dated tasks by deadline, then time of day, then authored order", () => {
    const { groups } = groupLinkedTasks(
      [
        task({ title: "aug-late", deadline: "2026-08-20" }),
        task({ title: "aug-early-2pm", deadline: "2026-08-01", time: "14:00" }),
        task({ title: "aug-early-9am", deadline: "2026-08-01", time: "09:00" }),
        task({ title: "aug-early-untimed", deadline: "2026-08-01" }),
      ],
      TODAY
    );
    expect(titles(groups[0].tasks)).toEqual([
      "aug-early-9am",
      "aug-early-2pm",
      "aug-early-untimed",
      "aug-late",
    ]);
  });

  it("keeps undated tasks in the order they were written", () => {
    // The Milestone 0..8 case: creation order is the plan's order.
    const milestones = [0, 1, 2, 3].map((n) => task({ title: `Milestone ${n}` }));
    // Feed them shuffled to prove the sort restores authored order.
    const { groups } = groupLinkedTasks(
      [milestones[2], milestones[0], milestones[3], milestones[1]],
      TODAY
    );
    expect(titles(groups[0].tasks)).toEqual([
      "Milestone 0",
      "Milestone 1",
      "Milestone 2",
      "Milestone 3",
    ]);
  });

  it("splits completed and cancelled tasks into done, freshest first", () => {
    const { groups, done } = groupLinkedTasks(
      [
        task({ title: "open" }),
        task({ title: "finished-old", completedAt: 100 }),
        task({ title: "abandoned", cancelledAt: 300 }),
        task({ title: "finished-new", completedAt: 200 }),
      ],
      TODAY
    );
    expect(titles(groups[0].tasks)).toEqual(["open"]);
    expect(titles(done)).toEqual(["abandoned", "finished-new", "finished-old"]);
  });

  it("does not reshuffle when a task is touched (updatedAt is ignored)", () => {
    const a = task({ title: "first", deadline: "2026-08-01", updatedAt: 0 });
    const b = task({ title: "second", deadline: "2026-08-02", updatedAt: 0 });
    const before = groupLinkedTasks([a, b], TODAY);
    const after = groupLinkedTasks([{ ...a, updatedAt: 9999 }, b], TODAY);
    expect(titles(after.groups[0].tasks)).toEqual(titles(before.groups[0].tasks));
  });
});
