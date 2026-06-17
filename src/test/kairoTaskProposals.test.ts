import { describe, expect, it } from "vitest";
import {
  buildKairoContext,
  buildKairoHistory,
  parseKairoTaskProposals,
  updateKairoTaskProposal,
} from "../lib/kairoCapability";
import type { Task } from "../types";
import type { Id } from "../../convex/_generated/dataModel";

function task(overrides: Partial<Task>): Task {
  return {
    _id: (overrides._id ?? "task") as Id<"tasks">,
    title: "Task",
    scheduledAt: 1,
    position: 0,
    createdBy: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("parseKairoTaskProposals", () => {
  it("extracts pending task proposals without applying them", () => {
    const result = parseKairoTaskProposals(
      'I recommend this.<add-task>{"title":" Plan launch ","deadline":"2026-06-08"}</add-task>'
    );

    expect(result.text).toBe("I recommend this.");
    expect(result.proposals).toEqual([
      {
        title: "Plan launch",
        deadline: "2026-06-08",
        status: "pending",
      },
    ]);
  });

  it("ignores malformed and titleless action blocks", () => {
    const result = parseKairoTaskProposals(
      'Keep this<add-task>{bad json}</add-task><add-task>{"deadline":"2026-06-08"}</add-task>'
    );

    expect(result).toEqual({ text: "Keep this", proposals: [] });
  });

  it("ignores proposals with unsafe task fields", () => {
    const result = parseKairoTaskProposals(
      `<add-task>{"title":"Valid","deadline":"not-a-date"}</add-task>` +
        `<add-task>{"title":"${"x".repeat(501)}"}</add-task>`
    );

    expect(result.proposals).toEqual([]);
  });

  it("updates exactly one proposal status", () => {
    const proposals = parseKairoTaskProposals(
      '<add-task>{"title":"One"}</add-task><add-task>{"title":"Two"}</add-task>'
    ).proposals;

    expect(updateKairoTaskProposal(proposals, 1, { status: "declined" })).toMatchObject([
      { title: "One", status: "pending" },
      { title: "Two", status: "declined" },
    ]);
  });
});

describe("kairoCapability", () => {
  it("builds a compact workspace context from Timeline, Inbox, and Completed Task state", () => {
    const context = buildKairoContext(
      [
        task({ title: "Today task", deadline: "2026-06-16", priority: "p1" }),
        task({ title: "Done task", completedAt: 10 }),
      ],
      [task({ title: "Inbox task" })]
    );

    expect(context).toContain("Scheduled tasks:");
    expect(context).toContain('"Today task" [DEADLINE] [P1]');
    expect(context).toContain("Inbox (1 items):");
    expect(context).toContain('"Inbox task"');
    expect(context).toContain("Completed this session: 1 tasks");
  });

  it("maps Kairo messages into provider history without exposing proposal state", () => {
    expect(
      buildKairoHistory([
        { from: "kairo", text: "hello" },
        { from: "me", text: "plan today" },
        { from: "kairo", text: "do this", tasks: [{ title: "Task", deadline: null, status: "pending" }] },
      ])
    ).toEqual([
      { role: "user", content: "plan today" },
      { role: "assistant", content: "do this" },
    ]);
  });
});
