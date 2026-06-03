import { describe, expect, it } from "vitest";
import type { KairoTaskInput } from "../lib/kairoApi";
import {
  KAIRO_ALL_TOOLS,
  buildThinContext,
  buildToolDefs,
  createHandleRegistry,
  isMutationTool,
  isReadTool,
  runReadTool,
  toolCallToAction,
  type KairoReadEnv,
} from "../lib/kairoTools";

const today = "2026-06-03";

const overdue: KairoTaskInput = {
  _id: "o1",
  title: "Overdue thing",
  status: "scheduled",
  scheduledDate: "2026-06-01",
};
const todayTask: KairoTaskInput = {
  _id: "t1",
  title: "Today thing",
  status: "scheduled",
  scheduledDate: today,
  priority: "p1",
};
const future: KairoTaskInput = {
  _id: "f1",
  title: "Future Dentist",
  status: "scheduled",
  scheduledDate: "2026-06-10",
};
const done: KairoTaskInput = {
  _id: "d1",
  title: "Finished",
  status: "completed",
  scheduledDate: "2026-06-02",
};
const inboxItem: KairoTaskInput = { _id: "i1", title: "Inbox dentist note", status: "inbox" };

function makeEnv(): KairoReadEnv {
  return {
    tasks: [overdue, todayTask, future, done],
    inboxTasks: [inboxItem],
    registry: createHandleRegistry(),
    today,
  };
}

describe("buildToolDefs", () => {
  it("exposes every read + mutation tool", () => {
    expect(KAIRO_ALL_TOOLS.map((t) => t.name)).toContain("get_inbox");
    expect(KAIRO_ALL_TOOLS.map((t) => t.name)).toContain("reschedule_task");
    expect(KAIRO_ALL_TOOLS).toHaveLength(16);
  });

  it("wraps schemas in the Anthropic shape", () => {
    const defs = buildToolDefs("anthropic") as Array<Record<string, unknown>>;
    expect(defs[0]).toHaveProperty("input_schema");
    expect(defs[0]).not.toHaveProperty("function");
  });

  it("wraps schemas in the OpenAI function shape", () => {
    const defs = buildToolDefs("openai") as Array<Record<string, unknown>>;
    expect(defs[0]).toMatchObject({ type: "function", function: { name: expect.any(String) } });
  });

  it("nests all declarations under a single Gemini functionDeclarations entry", () => {
    const defs = buildToolDefs("gemini") as Array<{ functionDeclarations: unknown[] }>;
    expect(defs).toHaveLength(1);
    expect(defs[0].functionDeclarations).toHaveLength(16);
  });
});

describe("createHandleRegistry", () => {
  it("mints sequential handles and reuses them per id", () => {
    const r = createHandleRegistry();
    expect(r.handleForTask("a")).toBe("T1");
    expect(r.handleForTask("b")).toBe("T2");
    expect(r.handleForTask("a")).toBe("T1"); // reused, not re-minted
    expect(r.handleForGoal("g")).toBe("G1");
    expect(r.taskIdMap).toEqual({ T1: "a", T2: "b" });
    expect(r.goalIdMap).toEqual({ G1: "g" });
  });
});

describe("runReadTool", () => {
  it("get_inbox returns inbox tasks with handles", () => {
    const env = makeEnv();
    const res = runReadTool("get_inbox", {}, env);
    expect(res.ok).toBe(true);
    expect(res.data).toEqual({ tasks: [{ handle: "T1", title: "Inbox dentist note", status: "inbox" }] });
    expect(env.registry.taskIdMap).toEqual({ T1: "i1" });
  });

  it("get_tasks_in_range filters to scheduled tasks within the span, sorted by date", () => {
    const res = runReadTool("get_tasks_in_range", { startDate: today, endDate: "2026-06-30" }, makeEnv());
    const tasks = (res.data as { tasks: Array<{ title: string }> }).tasks;
    expect(tasks.map((t) => t.title)).toEqual(["Today thing", "Future Dentist"]);
  });

  it("get_tasks_in_range tolerates reversed start/end and requires both", () => {
    const swapped = runReadTool("get_tasks_in_range", { startDate: "2026-06-30", endDate: today }, makeEnv());
    expect((swapped.data as { tasks: unknown[] }).tasks).toHaveLength(2);
    const missing = runReadTool("get_tasks_in_range", { startDate: today }, makeEnv());
    expect(missing.ok).toBe(false);
  });

  it("get_overdue returns only scheduled tasks before today", () => {
    const res = runReadTool("get_overdue", {}, makeEnv());
    const tasks = (res.data as { tasks: Array<{ title: string }> }).tasks;
    expect(tasks.map((t) => t.title)).toEqual(["Overdue thing"]);
  });

  it("search_tasks matches case-insensitively across tasks and inbox", () => {
    const res = runReadTool("search_tasks", { query: "dentist" }, makeEnv());
    const tasks = (res.data as { tasks: Array<{ title: string }> }).tasks;
    expect(tasks.map((t) => t.title).sort()).toEqual(["Future Dentist", "Inbox dentist note"]);
  });

  it("search_tasks rejects an empty query", () => {
    expect(runReadTool("search_tasks", { query: "  " }, makeEnv()).ok).toBe(false);
  });

  it("get_completed returns completed tasks, filterable by scheduled-date range", () => {
    const all = runReadTool("get_completed", {}, makeEnv());
    expect((all.data as { tasks: Array<{ title: string }> }).tasks.map((t) => t.title)).toEqual(["Finished"]);
    const outOfRange = runReadTool("get_completed", { startDate: today, endDate: "2026-06-30" }, makeEnv());
    expect((outOfRange.data as { tasks: unknown[] }).tasks).toHaveLength(0);
  });

  it("reports an unknown read tool", () => {
    expect(runReadTool("nope", {}, makeEnv())).toMatchObject({ ok: false });
  });
});

describe("buildThinContext", () => {
  it("lists today's tasks, goals with handles, and counts", () => {
    const registry = createHandleRegistry();
    const text = buildThinContext({
      tasks: [overdue, todayTask, future, done],
      inboxTasks: [inboxItem],
      goals: [{ id: "g1", text: "Ship beta", priority: "p1", deadline: "2026-06-20", createdAt: 1 }],
      goalLinks: { t1: "g1" },
      registry,
      today,
    });
    expect(text).toMatch(/Today: 2026-06-03/);
    // Today's task is listed with a handle and priority.
    expect(text).toMatch(/\[T1\] "Today thing" \[P1\]/);
    // Goal listed with handle, priority, deadline, and the linked task handle.
    expect(text).toMatch(/\[G1\] "Ship beta" \[P1\] \[DUE:2026-06-20\] \[LINKED:T1\]/);
    // Counts reflect inbox size, overdue, and total scheduled.
    expect(text).toMatch(/Counts: inbox 1, overdue 1, scheduled total 3\./);
    // The linked task ("t1" = todayTask) shares the same handle it got above.
    expect(registry.taskIdMap.T1).toBe("t1");
  });

  it("renders empty sections gracefully", () => {
    const text = buildThinContext({
      tasks: [],
      inboxTasks: [],
      goals: [],
      goalLinks: {},
      registry: createHandleRegistry(),
      today,
    });
    expect(text).toMatch(/Today's scheduled tasks:\n {2}\(none\)/);
    expect(text).toMatch(/Goals:\n {2}\(none\)/);
    expect(text).toMatch(/Counts: inbox 0, overdue 0, scheduled total 0\./);
  });
});

describe("tool classification", () => {
  it("separates read and mutation tools", () => {
    expect(isReadTool("get_inbox")).toBe(true);
    expect(isReadTool("add_task")).toBe(false);
    expect(isMutationTool("add_task")).toBe(true);
    expect(isMutationTool("get_inbox")).toBe(false);
  });
});

describe("toolCallToAction", () => {
  it("maps add_task onto the canonical add action", () => {
    expect(toolCallToAction("add_task", { title: "Gym", scheduledDate: "2026-06-05", type: "open" })).toEqual({
      kind: "add",
      title: "Gym",
      scheduledDate: "2026-06-05",
      type: "open",
    });
  });

  it("maps reference tools by handle", () => {
    expect(toolCallToAction("complete_task", { handle: "T2" })).toEqual({ kind: "complete", handle: "T2" });
    expect(toolCallToAction("reschedule_task", { handle: "T1", scheduledDate: "2026-06-06" })).toEqual({
      kind: "reschedule",
      handle: "T1",
      scheduledDate: "2026-06-06",
    });
  });

  it("maps link_task_goal handles through parseAction aliases", () => {
    expect(toolCallToAction("link_task_goal", { taskHandle: "T1", goalHandle: "G2" })).toEqual({
      kind: "linkTaskGoal",
      taskHandle: "T1",
      goalHandle: "G2",
    });
  });

  it("returns null for a read tool or unknown name", () => {
    expect(toolCallToAction("get_inbox", {})).toBeNull();
    expect(toolCallToAction("frobnicate", {})).toBeNull();
  });

  it("returns null for a malformed mutation call (missing required field)", () => {
    expect(toolCallToAction("reschedule_task", { handle: "T1" })).toBeNull();
  });
});
