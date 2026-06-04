import { describe, expect, it, vi } from "vitest";
import { runKairoAgent, type KairoAgentDeps } from "../lib/kairoAgent";
import { createHandleRegistry } from "../lib/kairoTools";
import type { KairoConfig } from "../lib/kairoConfig";
import type { KairoActionResult } from "../lib/kairoActions";
import type { KairoAction } from "../lib/kairoApi";

const config: KairoConfig = { providerFormat: "anthropic", apiKey: "k", baseUrl: "u", model: "m" };

// Anthropic-shaped response helpers (config above uses providerFormat anthropic).
function toolUse(calls: { id: string; name: string; input?: unknown }[], text = "") {
  return {
    content: [
      ...(text ? [{ type: "text", text }] : []),
      ...calls.map((c) => ({ type: "tool_use", id: c.id, name: c.name, input: c.input ?? {} })),
    ],
  };
}
function textOnly(text: string) {
  return { content: [{ type: "text", text }] };
}

function queuedCaller(responses: unknown[]) {
  let i = 0;
  return vi.fn(async () => responses[Math.min(i++, responses.length - 1)]);
}

function makeDeps(over: Partial<KairoAgentDeps> = {}): KairoAgentDeps {
  const registry = over.registry ?? createHandleRegistry();
  return {
    config,
    systemPrompt: "SYS",
    tools: [],
    call: vi.fn(),
    readEnv: { tasks: [], inboxTasks: [], registry, today: "2026-06-03" },
    registry,
    applyActions: vi.fn(async () => ({ results: [], beforeTitles: [] })),
    ...over,
  };
}

const applied = (action: KairoAction, extra: Record<string, unknown> = {}): KairoActionResult =>
  ({ action, status: "applied", undo: null, ...extra }) as KairoActionResult;

describe("runKairoAgent", () => {
  it("loops read → mutate → finish, accumulating outcomes", async () => {
    const call = queuedCaller([
      toolUse([{ id: "c1", name: "get_overdue" }]),
      toolUse([{ id: "c2", name: "reschedule_task", input: { handle: "T1", scheduledDate: "2026-06-05" } }]),
      textOnly("Rescheduled it."),
    ]);
    const applyActions = vi.fn(async (actions: KairoAction[]) => ({
      results: actions.map((a) => applied(a, { taskId: "x" })),
      beforeTitles: ["Dentist"],
    }));

    const result = await runKairoAgent([{ role: "user", text: "fix overdue" }], makeDeps({ call, applyActions }));

    expect(result.text).toBe("Rescheduled it.");
    expect(result.stopped).toBe(false);
    expect(call).toHaveBeenCalledTimes(3);
    expect(applyActions).toHaveBeenCalledTimes(1);
    expect(applyActions.mock.calls[0][0]).toEqual([
      { kind: "reschedule", handle: "T1", scheduledDate: "2026-06-05" },
    ]);
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0].beforeTitle).toBe("Dentist");
  });

  it("stops at the round cap without firing the pending calls", async () => {
    const call = vi.fn(async () => toolUse([{ id: "c", name: "get_inbox" }]));
    const applyActions = vi.fn(async () => ({ results: [], beforeTitles: [] }));

    const result = await runKairoAgent(
      [{ role: "user", text: "x" }],
      makeDeps({ call, applyActions, maxRounds: 2 })
    );

    expect(result.stopped).toBe(true);
    expect(result.stopReason).toBe("max_rounds");
    expect(call).toHaveBeenCalledTimes(2);
    expect(applyActions).not.toHaveBeenCalled();
  });

  it("halts when shouldCancel flips, before the next round", async () => {
    const call = vi.fn(async () => toolUse([{ id: "c", name: "get_inbox" }]));
    let checks = 0;
    const shouldCancel = () => ++checks >= 3;

    const result = await runKairoAgent([{ role: "user", text: "x" }], makeDeps({ call, shouldCancel }));

    expect(result.stopped).toBe(true);
    expect(result.stopReason).toBe("cancelled");
    expect(call).toHaveBeenCalledTimes(1);
  });

  it("returns an error outcome when the provider call throws", async () => {
    const call = vi.fn(async () => {
      throw new Error("API error 400");
    });
    const result = await runKairoAgent([{ role: "user", text: "x" }], makeDeps({ call }));
    expect(result.error).toBe("API error 400");
    expect(result.stopped).toBe(false);
  });

  it("echoes a new handle for created entities and registers it", async () => {
    const registry = createHandleRegistry();
    const bodies: Record<string, unknown>[] = [];
    const call = vi.fn(async (body: Record<string, unknown>) => {
      bodies.push(body);
      return bodies.length === 1
        ? toolUse([{ id: "a1", name: "add_task", input: { title: "Gym" } }])
        : textOnly("Added Gym.");
    });
    const applyActions = vi.fn(async (actions: KairoAction[]) => ({
      results: actions.map((a) => applied(a, { taskId: "new-task-id" })),
      beforeTitles: [null],
    }));

    const result = await runKairoAgent([{ role: "user", text: "add gym" }], makeDeps({ call, applyActions, registry }));

    expect(result.text).toBe("Added Gym.");
    expect(registry.taskIdMap.T1).toBe("new-task-id");
    // The follow-up request carries the tool result with the echoed handle.
    const messages = (bodies[1] as { messages: Array<{ content: unknown }> }).messages;
    const toolMsg = messages.find(
      (m) => Array.isArray(m.content) && (m.content[0] as { type?: string })?.type === "tool_result"
    );
    const content = (toolMsg?.content as Array<{ content: string }>)[0].content;
    expect(JSON.parse(content)).toMatchObject({ status: "applied", handle: "T1" });
  });

  it("feeds an invalid mutation call back without applying it", async () => {
    const call = queuedCaller([
      toolUse([{ id: "c1", name: "reschedule_task", input: { handle: "T1" } }]), // no scheduledDate
      textOnly("I need a date for that."),
    ]);
    const applyActions = vi.fn(async () => ({ results: [], beforeTitles: [] }));

    const result = await runKairoAgent([{ role: "user", text: "move it" }], makeDeps({ call, applyActions }));

    expect(applyActions).not.toHaveBeenCalled();
    expect(result.outcomes).toHaveLength(0);
    expect(result.text).toBe("I need a date for that.");
  });

  it("emits progress labels for read and mutation phases", async () => {
    const call = queuedCaller([
      toolUse([{ id: "c1", name: "get_inbox" }]),
      toolUse([{ id: "c2", name: "complete_task", input: { handle: "T1" } }]),
      textOnly("Done."),
    ]);
    const applyActions = vi.fn(async (actions: KairoAction[]) => ({
      results: actions.map((a) => applied(a)),
      beforeTitles: [null],
    }));
    const labels: string[] = [];
    const onProgress = (l: string) => labels.push(l);

    await runKairoAgent([{ role: "user", text: "clear inbox" }], makeDeps({ call, applyActions, onProgress }));

    expect(labels).toContain("Checking your inbox…");
    expect(labels).toContain("Updating your tasks…");
  });

  it("serves the reflow preview as a read and applies a reflow batch atomically", async () => {
    const call = queuedCaller([
      toolUse([{ id: "p1", name: "plan_overdue_reflow" }]),
      toolUse([{ id: "r1", name: "reflow_overdue", input: { extendDeadlines: true } }]),
      textOnly("Re-spread your overdue work."),
    ]);
    const reflow = {
      plan: vi.fn(() => ({ totalOverdue: 2, goals: [{ goal: "Ship" }], orphans: [] })),
      apply: vi.fn(async () => ({
        payload: { ok: true, status: "reflowed", rescheduled: 2, deadlinesMoved: 1 },
        outcome: {
          beforeTitle: null,
          result: {
            action: { kind: "reflow" as const, label: "Reflowed Ship" },
            status: "applied" as const,
            undo: async () => undefined,
          },
        },
      })),
    };
    const applyActions = vi.fn(async (actions: KairoAction[]) => ({
      results: actions.map((a) => applied(a)),
      beforeTitles: actions.map(() => null),
    }));

    const result = await runKairoAgent(
      [{ role: "user", text: "fix my overdue" }],
      makeDeps({ call, applyActions, reflow })
    );

    expect(reflow.plan).toHaveBeenCalledTimes(1);
    expect(reflow.apply).toHaveBeenCalledWith({ extendDeadlines: true });
    expect(applyActions).not.toHaveBeenCalled();
    expect(result.outcomes).toHaveLength(1);
    expect(result.outcomes[0]?.result.action.kind).toBe("reflow");
    expect(result.text).toBe("Re-spread your overdue work.");
  });

  it("reports a noop when reflow_overdue produces no changes, without applying", async () => {
    const call = queuedCaller([
      toolUse([{ id: "r1", name: "reflow_overdue" }]),
      textOnly("Nothing overdue to move."),
    ]);
    const reflow = {
      plan: vi.fn(),
      apply: vi.fn(async () => ({
        payload: {
          ok: true,
          status: "noop",
          detail: "No overdue work needed rescheduling.",
          plan: { totalRescheduled: 0 },
        },
      })),
    };
    const applyActions = vi.fn(async () => ({ results: [], beforeTitles: [] }));

    const result = await runKairoAgent(
      [{ role: "user", text: "fix overdue" }],
      makeDeps({ call, applyActions, reflow })
    );

    expect(applyActions).not.toHaveBeenCalled();
    expect(reflow.apply).toHaveBeenCalledTimes(1);
    expect(result.outcomes).toHaveLength(0);
    expect(result.text).toBe("Nothing overdue to move.");
  });

  it("feeds back an error when a reflow tool is called but no runtime is wired", async () => {
    const call = queuedCaller([
      toolUse([{ id: "r1", name: "reflow_overdue" }]),
      textOnly("I can't reschedule right now."),
    ]);
    const applyActions = vi.fn(async () => ({ results: [], beforeTitles: [] }));

    const result = await runKairoAgent(
      [{ role: "user", text: "fix overdue" }],
      makeDeps({ call, applyActions }) // no reflow dep
    );

    expect(applyActions).not.toHaveBeenCalled();
    expect(result.outcomes).toHaveLength(0);
    expect(result.text).toBe("I can't reschedule right now.");
  });

  it("updates later read tools with tasks created earlier in the same agent loop", async () => {
    const call = queuedCaller([
      toolUse([{ id: "a1", name: "add_task", input: { title: "Gym" } }]),
      toolUse([{ id: "a2", name: "get_inbox" }]),
      textOnly("Added it to your inbox."),
    ]);
    const applyActions = vi.fn(async (actions: KairoAction[]) => ({
      results: actions.map((a) => applied(a, { taskId: "new-task-id" })),
      beforeTitles: [null],
    }));

    await runKairoAgent(
      [{ role: "user", text: "add gym then show inbox" }],
      makeDeps({ call, applyActions })
    );

    const thirdBody = (call.mock.calls as unknown[][])[2]?.[0] as {
      messages: Array<{ role: string; content: unknown }>;
    };
    const toolMessage = [...thirdBody.messages].reverse().find(
      (message) => message.role === "user" && Array.isArray(message.content)
    ) as { content: Array<{ type: string; content?: string }> } | undefined;
    const inboxResult = toolMessage?.content.find((part) => part.type === "tool_result")?.content;

    expect(inboxResult).toBeDefined();
    expect(JSON.parse(inboxResult!)).toEqual({
      tasks: [
        {
          handle: "T1",
          title: "Gym",
          status: "inbox",
          type: "open",
        },
      ],
    });
  });
});
