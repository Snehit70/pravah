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
  type NormalizedToolCall,
  type ToolResultEntry,
} from "./kairoApi";
import type { KairoConfig } from "./kairoConfig";
import type { KairoActionResult } from "./kairoActions";
import {
  isReadTool,
  runReadTool,
  toolCallToAction,
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
    onProgress,
    shouldCancel,
  } = deps;
  const maxRounds = deps.maxRounds ?? KAIRO_MAX_ROUNDS;

  const turns: AgentTurn[] = [...initialTurns];
  const outcomes: AgentMutationOutcome[] = [];
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
    // requires a tool_result for every tool_use). Reads run inline; mutations
    // are collected and batched so the executor's snapshot cache is correct.
    const resultById = new Map<string, ToolResultEntry>();
    const mutationCalls: { call: NormalizedToolCall; action: KairoAction }[] = [];

    for (const tc of toolCalls) {
      if (isReadTool(tc.name)) {
        onProgress?.(READ_PROGRESS[tc.name] ?? "Thinking…");
        const read = runReadTool(tc.name, tc.args, readEnv);
        resultById.set(tc.id, {
          id: tc.id,
          name: tc.name,
          content: jsonResult(read.ok ? read.data : { error: read.error }),
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
      mutationCalls.push({ call: tc, action });
    }

    if (mutationCalls.length) {
      onProgress?.("Updating your tasks…");
      const { results, beforeTitles } = await applyActions(mutationCalls.map((m) => m.action));
      results.forEach((res, i) => {
        const tc = mutationCalls[i].call;
        outcomes.push({ result: res, beforeTitle: beforeTitles[i] ?? null });
        // Echo a handle for created entities so the model can chain on them.
        let handle: string | undefined;
        if (res.status === "applied") {
          if (res.action.kind === "add" && res.taskId) {
            handle = registry.handleForTask(res.taskId);
          } else if (res.action.kind === "addGoal" && res.goalId) {
            handle = registry.handleForGoal(res.goalId);
          }
        }
        const payload =
          res.status === "applied"
            ? { ok: true, status: "applied", ...(handle ? { handle } : {}) }
            : res.status === "skipped"
              ? { ok: false, status: "skipped", detail: res.reason }
              : { ok: false, status: "failed", detail: res.error };
        resultById.set(tc.id, { id: tc.id, name: tc.name, content: jsonResult(payload) });
      });
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
