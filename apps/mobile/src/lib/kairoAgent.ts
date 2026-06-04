/**
 * Kairo agentic loop
 *
 * Provider-agnostic orchestration: given a thin-context system prompt, the
 * provider-shaped tool defs, and an HTTP `call`, it runs a bounded loop —
 * model call → execute tool calls → feed results back → repeat — until the
 * model stops requesting tools or the round cap is hit.
 *
 * Design notes:
 *   - The loop holds a neutral `AgentTurn[]` and re-serializes it each round
 *     via `buildToolRequestBody`, so this file has zero provider branching.
 *   - Read tools run inline (local in-memory filters); mutation tools are
 *     batched through the injected `applyActions` so the executor's per-turn
 *     snapshot cache stays correct across actions on the same task.
 *   - Mutation errors are fed back as tool results (not thrown) so the model
 *     can adapt; the loop only aborts on a transport/provider failure.
 *   - Nothing here touches Convex, React, or storage — it's unit-testable with
 *     a mocked `call` and `applyActions`.
 */

import {
  buildToolRequestBody,
  extractToolCalls,
  type AgentTurn,
  type KairoAction,
  type KairoTaskInput,
  type NormalizedToolCall,
  type ToolResultEntry,
} from "./kairoApi";
import type { KairoConfig } from "./kairoConfig";
import type { KairoActionResult } from "./kairoActions";
import {
  isReadTool,
  runReadTool,
  toolCallToAction,
  REFLOW_PLAN_TOOL,
  REFLOW_APPLY_TOOL,
  type HandleRegistry,
  type KairoReadEnv,
} from "./kairoTools";

export const KAIRO_MAX_ROUNDS = 6;

/** Performs one HTTP round-trip to the provider; returns the parsed JSON body
 *  or throws on transport / non-OK response. Injected so the loop stays free of
 *  fetch, URLs, and headers (and is trivially mockable in tests). */
export type KairoAgentCaller = (body: Record<string, unknown>) => Promise<unknown>;

/** Runs a batch of mutation actions through the real executor and returns the
 *  results plus the before-title for each (used for chip labels). Injected so
 *  the loop never imports Convex mutations directly. */
export type ApplyAgentActions = (
  actions: KairoAction[]
) => Promise<{ results: KairoActionResult[]; beforeTitles: (string | null)[] }>;

export interface AgentMutationOutcome {
  result: KairoActionResult;
  beforeTitle: string | null;
}

/** Optional overdue-reflow runtime. When supplied, exposes two tools to the
 *  model: a read-only plan preview and a deterministic apply. Bound by the
 *  caller to the real MobileTask corpus + goal links, since the engine needs
 *  plan-order/position data the thin read env doesn't carry. */
export interface KairoReflowRuntime {
  /** Read-only preview payload (per-goal plan + orphans). */
  plan: () => unknown | Promise<unknown>;
  /** Apply the canonical backend reflow and optionally return a single
   *  synthetic outcome for UI chips/undo. */
  apply: (args: Record<string, unknown>) => Promise<{
    payload: unknown;
    outcome?: AgentMutationOutcome;
  }>;
}

export interface KairoAgentDeps {
  config: KairoConfig;
  /** System prompt with the thin context already injected. */
  systemPrompt: string;
  /** Provider-shaped tool defs from buildToolDefs. */
  tools: unknown[];
  call: KairoAgentCaller;
  readEnv: KairoReadEnv;
  registry: HandleRegistry;
  applyActions: ApplyAgentActions;
  /** Overdue-reflow tools. Omitted leaves the model to reschedule by hand. */
  reflow?: KairoReflowRuntime;
  /** Surface a short status label for the currently running tool. */
  onProgress?: (label: string) => void;
  /** Checked between rounds; true halts the loop without firing pending calls. */
  shouldCancel?: () => boolean;
  maxRounds?: number;
}

export type KairoStopReason = "cancelled" | "max_rounds";

export interface KairoAgentResult {
  /** Final assistant prose (latest non-empty model text). */
  text: string;
  /** Mutation outcomes across all rounds, in execution order — for chips/undo. */
  outcomes: AgentMutationOutcome[];
  /** True when halted by cancel or the round cap rather than a natural finish. */
  stopped: boolean;
  stopReason?: KairoStopReason;
  /** Set when the loop failed on a transport/provider error. */
  error?: string;
}

const READ_PROGRESS: Record<string, string> = {
  get_inbox: "Checking your inbox…",
  get_tasks_in_range: "Looking at your schedule…",
  get_overdue: "Checking overdue tasks…",
  search_tasks: "Searching your tasks…",
  get_completed: "Reviewing completed work…",
};

function jsonResult(payload: unknown): string {
  try {
    return JSON.stringify(payload);
  } catch {
    return "{}";
  }
}

/** Tool-result payload for a 1:1 mutation tool. Echoes a fresh handle for
 *  created entities so the model can chain on them in a later round. */
function singleActionPayload(
  res: KairoActionResult | undefined,
  registry: HandleRegistry
): unknown {
  if (!res) return { ok: false };
  if (res.status === "applied") {
    let handle: string | undefined;
    if (res.action.kind === "add" && res.taskId) {
      handle = registry.handleForTask(res.taskId);
    } else if (res.action.kind === "addGoal" && res.goalId) {
      handle = registry.handleForGoal(res.goalId);
    }
    return { ok: true, status: "applied", ...(handle ? { handle } : {}) };
  }
  if (res.status === "skipped") return { ok: false, status: "skipped", detail: res.reason };
  return { ok: false, status: "failed", detail: res.error };
}

function cloneTask(task: KairoTaskInput): KairoTaskInput {
  return { ...task };
}

function reconcileTaskSnapshot(
  env: KairoReadEnv,
  action: KairoAction,
  result: KairoActionResult
) {
  if (result.status !== "applied") return;

  const upsertTask = (next: KairoTaskInput) => {
    const tasks = env.tasks.filter((task) => task._id !== next._id);
    const inboxTasks = env.inboxTasks.filter((task) => task._id !== next._id);
    if (next.status === "inbox") {
      env.tasks = tasks;
      env.inboxTasks = [...inboxTasks, next];
      return;
    }
    env.tasks = [...tasks, next];
    env.inboxTasks = inboxTasks;
  };

  const removeTask = (taskId: string) => {
    env.tasks = env.tasks.filter((task) => task._id !== taskId);
    env.inboxTasks = env.inboxTasks.filter((task) => task._id !== taskId);
  };

  const resolveTaskId = (): string | undefined => {
    if (result.taskId) return result.taskId;
    if ("handle" in action) return env.registry.taskIdMap[action.handle];
    return undefined;
  };

  if (action.kind === "add") {
    if (!result.taskId) return;
    upsertTask({
      _id: result.taskId,
      title: action.title,
      status: action.scheduledDate ? "scheduled" : "inbox",
      scheduledDate: action.scheduledDate ?? undefined,
      type: action.type,
      deadline: action.type === "deadline" ? action.scheduledDate ?? undefined : undefined,
    });
    return;
  }

  const taskId = resolveTaskId();
  if (!taskId) return;
  const current =
    env.tasks.find((task) => task._id === taskId) ??
    env.inboxTasks.find((task) => task._id === taskId);
  if (!current) return;

  switch (action.kind) {
    case "reschedule":
      upsertTask({
        ...cloneTask(current),
        status: "scheduled",
        scheduledDate: action.scheduledDate,
      });
      return;
    case "complete":
      upsertTask({
        ...cloneTask(current),
        status: "completed",
      });
      return;
    case "unschedule":
      upsertTask({
        ...cloneTask(current),
        status: "inbox",
        scheduledDate: undefined,
      });
      return;
    case "update": {
      const next = cloneTask(current);
      if (action.title !== undefined) next.title = action.title;
      if (action.priority !== undefined) next.priority = action.priority;
      if (action.deadline !== undefined) {
        next.deadline = action.deadline ?? undefined;
        if (action.deadline) {
          const preservesInboxOpenTask =
            current.status === "inbox" &&
            (current.type ?? "open") === "open" &&
            !current.scheduledDate;
          if (!preservesInboxOpenTask) {
            next.type = "deadline";
            next.status = "scheduled";
            next.scheduledDate = action.deadline;
          }
        } else {
          next.type = "open";
          const wasAutoScheduledByDeadline =
            current.status === "scheduled" &&
            current.type === "deadline" &&
            !!current.deadline &&
            current.scheduledDate === current.deadline;
          if (wasAutoScheduledByDeadline) {
            next.status = "inbox";
            next.scheduledDate = undefined;
          }
        }
      }
      upsertTask(next);
      return;
    }
    case "delete":
      removeTask(taskId);
      return;
    default:
      return;
  }
}

export async function runKairoAgent(
  initialTurns: AgentTurn[],
  deps: KairoAgentDeps
): Promise<KairoAgentResult> {
  const {
    config,
    systemPrompt,
    tools,
    call,
    readEnv,
    registry,
    applyActions,
    reflow,
    onProgress,
    shouldCancel,
  } = deps;
  const maxRounds = deps.maxRounds ?? KAIRO_MAX_ROUNDS;

  const turns: AgentTurn[] = [...initialTurns];
  const outcomes: AgentMutationOutcome[] = [];
  const currentReadEnv: KairoReadEnv = {
    ...readEnv,
    tasks: readEnv.tasks.map(cloneTask),
    inboxTasks: readEnv.inboxTasks.map(cloneTask),
  };
  let finalText = "";

  for (let round = 0; round < maxRounds; round++) {
    if (shouldCancel?.()) {
      return { text: finalText, outcomes, stopped: true, stopReason: "cancelled" };
    }

    let data: unknown;
    try {
      data = await call(buildToolRequestBody(config, systemPrompt, tools, turns));
    } catch (error) {
      return {
        text: finalText,
        outcomes,
        stopped: false,
        error: error instanceof Error ? error.message : "Network error",
      };
    }

    const { text, toolCalls } = extractToolCalls(data, config.providerFormat);
    if (text) finalText = text;

    // Natural finish: the model replied without requesting more tools.
    if (toolCalls.length === 0) {
      return { text: finalText, outcomes, stopped: false };
    }

    // Budget exhausted but the model still wants tools — stop without firing
    // the pending calls, so we never apply actions the user can't see.
    if (round === maxRounds - 1) {
      return { text: finalText, outcomes, stopped: true, stopReason: "max_rounds" };
    }

    if (shouldCancel?.()) {
      return { text: finalText, outcomes, stopped: true, stopReason: "cancelled" };
    }

    turns.push({ role: "assistant", text, toolCalls });

    // Resolve every call to a result, preserving 1:1 order/count (Anthropic
    // requires a tool_result for every tool_use). Reads run inline; standard
    // mutations are collected and batched so the executor's snapshot cache is
    // correct. Canonical overdue reflow now executes directly through its own
    // backend contract instead of expanding into generic task mutations here.
    const resultById = new Map<string, ToolResultEntry>();
    const mutationGroups: {
      call: NormalizedToolCall;
      actions: KairoAction[];
    }[] = [];

    for (const tc of toolCalls) {
      if (isReadTool(tc.name)) {
        onProgress?.(READ_PROGRESS[tc.name] ?? "Thinking…");
        const read = runReadTool(tc.name, tc.args, currentReadEnv);
        resultById.set(tc.id, {
          id: tc.id,
          name: tc.name,
          content: jsonResult(read.ok ? read.data : { error: read.error }),
        });
        continue;
      }

      if (tc.name === REFLOW_PLAN_TOOL) {
        onProgress?.("Planning your reschedule…");
        const payload = reflow
          ? await reflow.plan()
          : { error: "Overdue reflow is unavailable right now." };
        resultById.set(tc.id, { id: tc.id, name: tc.name, content: jsonResult(payload) });
        continue;
      }

      if (tc.name === REFLOW_APPLY_TOOL) {
        if (!reflow) {
          resultById.set(tc.id, {
            id: tc.id,
            name: tc.name,
            content: jsonResult({ ok: false, error: "Overdue reflow is unavailable right now." }),
          });
          continue;
        }
        onProgress?.("Rescheduling overdue work…");
        const applied = await reflow.apply(tc.args);
        if (applied.outcome) outcomes.push(applied.outcome);
        resultById.set(tc.id, {
          id: tc.id,
          name: tc.name,
          content: jsonResult(applied.payload),
        });
        continue;
      }

      const action = toolCallToAction(tc.name, tc.args);
      if (!action) {
        resultById.set(tc.id, {
          id: tc.id,
          name: tc.name,
          content: jsonResult({ ok: false, error: "Invalid or unknown tool arguments." }),
        });
        continue;
      }
      mutationGroups.push({ call: tc, actions: [action] });
    }

    if (mutationGroups.length) {
      onProgress?.("Updating your tasks…");
      const flatActions = mutationGroups.flatMap((g) => g.actions);
      const { results, beforeTitles } = await applyActions(flatActions);

      let cursor = 0;
      for (const group of mutationGroups) {
        const groupResults: KairoActionResult[] = [];
        for (let k = 0; k < group.actions.length; k += 1) {
          const res = results[cursor];
          const beforeTitle = beforeTitles[cursor] ?? null;
          cursor += 1;
          if (!res) continue;
          outcomes.push({ result: res, beforeTitle });
          reconcileTaskSnapshot(currentReadEnv, group.actions[k], res);
          groupResults.push(res);
        }
        resultById.set(group.call.id, {
          id: group.call.id,
          name: group.call.name,
          content: jsonResult(singleActionPayload(groupResults[0], registry)),
        });
      }
    }

    const results: ToolResultEntry[] = toolCalls.map(
      (tc) =>
        resultById.get(tc.id) ?? { id: tc.id, name: tc.name, content: jsonResult({ ok: false }) }
    );
    turns.push({ role: "tool", results });
  }

  // Loop exhausted (the last round normally returns early); treat as a cap stop.
  return { text: finalText, outcomes, stopped: true, stopReason: "max_rounds" };
}
