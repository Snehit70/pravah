import type { KairoConfig, KairoProviderFormat } from "./kairoConfig";

/**
 * Pure request/response helpers ported verbatim from src/components/Kairo.tsx
 * (see web file lines 426-485). Keeping them in their own module so the UI
 * component can stay thin and so we can unit-test the parsing logic.
 */

export interface KairoMessage {
  from: "me" | "kairo";
  text: string;
  tasks?: KairoTaskBlock[];
  /** When set on a kairo error bubble, surfaces an inline "Try again" button
   *  that re-runs the original prompt instead of forcing the user to retype. */
  retryPrompt?: string;
  /** Per-bubble action chips rendered under the message body. Carries the
   *  outcome of every <verb-task> block the assistant emitted with this turn
   *  plus a synchronous handle to undo it. Not persisted across sessions —
   *  see kairoChatStorage which strips this field on save. */
  actions?: KairoMessageAction[];
}

export type KairoMessageActionState = "applied" | "skipped" | "failed" | "undone";

export interface KairoMessageAction {
  id: string;
  kind: KairoAction["kind"];
  /** Display label like "Rescheduled \"Email Sara\" to Fri". */
  label: string;
  state: KairoMessageActionState;
  /** Reason text shown alongside skipped/failed chips. */
  detail?: string;
}

export interface KairoTaskBlock {
  title: string;
  scheduledDate: string | null;
  type: "open" | "deadline";
}

export type KairoGoalInput = {
  id: string;
  text: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
  createdAt?: number;
};

/** System prompt for the native tool-calling agent. It describes a tool-based
 *  workflow and receives only a *thin* context — the model reaches the rest via
 *  read tools. `{CONTEXT}` is filled by buildThinContext. */
export const KAIRO_AGENT_SYSTEM_PROMPT = `You are Kairo, an intelligent work orchestration assistant embedded in Pravah — a timeline-first task management tool. You help the user manage their schedule, think through priorities, and keep their week intentional.

You can read and modify the user's workspace through the provided tools. The summary below is your starting context; anything not shown, fetch with a read tool before acting.

{CONTEXT}

How to work:
- Use read tools (get_inbox, get_tasks_in_range, get_overdue, search_tasks, get_completed) to gather what you need before acting. Handles like T3 and G1 are stable for this turn — pass them to tools exactly as shown.
- Use mutation tools (add_task, reschedule_task, complete_task, unschedule_task, update_task, delete_task, add_goal, update_goal, delete_goal, link_task_goal, unlink_task_goal) to act on the user's behalf. Every change applies immediately and the user can undo it, so don't ask for confirmation — just act, then briefly confirm.
- When you create a task or goal, the tool result returns its new handle. Use that handle to act on it further (e.g. link a just-created task to a goal).
- When finished, reply with a short natural-language summary. Never mention tool names or handles to the user — they are internal.

Style:
- Be direct and warm, not corporate. Give one clear recommendation before alternatives.
- Acknowledge what's already done before suggesting more work.
- Flag honestly when a day looks overloaded.
- Keep replies short: 2-4 sentences for simple questions, 3-5 bullets max for analysis.
- Never invent tasks, goals, or details not present in the workspace.`;

export type KairoTaskInput = {
  /** Convex task id. Required so we can mint a short handle ([T1], [T2], ...)
   *  the model can use to reference the task in action blocks. */
  _id: string;
  title: string;
  scheduledDate?: string;
  status: "inbox" | "scheduled" | "completed" | "cancelled";
  priority?: "p1" | "p2" | "p3";
  type?: "open" | "deadline";
  deadline?: string;
};

/** Maps short handles surfaced to the model (e.g. "T12") back to real Convex
 *  task ids. Scoped to a single send: regenerated each turn so handles don't
 *  drift as the workspace changes. */
export type KairoIdMap = Record<string, string>;

/** Pick four conversation starters that reflect the user's current state.
 *  Falls back to evergreen prompts when the workspace is empty so a fresh
 *  install still has something tappable. Pure for easy testing. */
export function buildKairoStarters(
  allTasks: KairoTaskInput[],
  inboxTasks: KairoTaskInput[],
  today: string
): string[] {
  const starters: string[] = [];
  const scheduled = allTasks.filter((t) => t.status === "scheduled");
  const overdue = scheduled.filter(
    (t) => t.scheduledDate && t.scheduledDate < today
  );
  const dueToday = scheduled.filter((t) => t.scheduledDate === today);

  if (overdue.length) starters.push(`What's overdue? (${overdue.length})`);
  if (dueToday.length) starters.push("What's on today?");
  if (inboxTasks.length >= 3) starters.push(`Triage my inbox (${inboxTasks.length})`);
  if (scheduled.length >= 5) starters.push("What looks heavy this week?");

  const evergreen = [
    "Plan my week",
    "Summarize my progress",
    "What should I focus on?",
    "What's overdue?",
  ];
  for (const s of evergreen) {
    if (starters.length >= 4) break;
    if (!starters.some((existing) => existing.startsWith(s))) starters.push(s);
  }
  return starters.slice(0, 4);
}

/** Cheap, dependency-free token estimate (~4 chars/token, the common rule of
 *  thumb for English). Deliberately approximate — it powers the composer's live
 *  context meter, where directional feedback matters more than exactness. */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/** Best-effort context-window size (in tokens) for a configured model id, used
 *  to render "% of context" in the composer meter. Falls back to a 128k default
 *  for unrecognized ids so the meter still shows a sane percentage. */
export function contextWindowForModel(model: string | undefined | null): number {
  const m = (model ?? "").toLowerCase();
  if (m.includes("claude")) return 200_000;
  if (m.includes("gemini")) return 1_000_000;
  if (
    m.includes("gpt-5") ||
    m.includes("gpt-4.1") ||
    m.includes("gpt-4o") ||
    m.includes("o1") ||
    m.includes("o3")
  ) {
    return 128_000;
  }
  return 128_000;
}

function readAssistantText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          ((!("type" in part)) || (part as { type?: string }).type === "text")
        ) {
          return String((part as { text: unknown }).text ?? "");
        }
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

// ─── Action blocks ────────────────────────────────────────────────────────────
//
// Kairo's full task-control surface. Each action mirrors a Convex mutation
// 1:1; the parser converts <verb-task>{...}</verb-task> XML blobs into this
// discriminated union, and the executor in `kairoActions.ts` runs them.

export type KairoAction =
  | {
      kind: "add";
      title: string;
      scheduledDate: string | null;
      type: "open" | "deadline";
    }
  | { kind: "reschedule"; handle: string; scheduledDate: string }
  | { kind: "complete"; handle: string }
  | { kind: "unschedule"; handle: string }
  | {
      kind: "update";
      handle: string;
      title?: string;
      priority?: "p1" | "p2" | "p3";
      deadline?: string | null;
    }
  | { kind: "delete"; handle: string }
  | {
      kind: "addGoal";
      text: string;
      description?: string;
      deadline?: string;
      priority?: "p1" | "p2" | "p3";
    }
  | {
      kind: "updateGoal";
      handle: string;
      text?: string;
      description?: string | null;
      deadline?: string | null;
      priority?: "p1" | "p2" | "p3" | null;
    }
  | { kind: "deleteGoal"; handle: string }
  | { kind: "linkTaskGoal"; taskHandle: string; goalHandle: string }
  | { kind: "unlinkTaskGoal"; taskHandle: string };

type ParsedJson = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asPriority(v: unknown): "p1" | "p2" | "p3" | undefined {
  return v === "p1" || v === "p2" || v === "p3" ? v : undefined;
}

export function parseAction(kind: string, parsed: ParsedJson): KairoAction | null {
  switch (kind) {
    case "add": {
      const title = asString(parsed.title);
      if (!title) return null;
      return {
        kind: "add",
        title,
        scheduledDate: typeof parsed.scheduledDate === "string" ? parsed.scheduledDate : null,
        type: parsed.type === "deadline" ? "deadline" : "open",
      };
    }
    case "reschedule": {
      const handle = asString(parsed.id ?? parsed.handle);
      const scheduledDate = asString(parsed.scheduledDate);
      if (!handle || !scheduledDate) return null;
      return { kind: "reschedule", handle, scheduledDate };
    }
    case "complete":
    case "unschedule":
    case "delete": {
      const handle = asString(parsed.id ?? parsed.handle);
      if (!handle) return null;
      return { kind, handle };
    }
    case "update": {
      const handle = asString(parsed.id ?? parsed.handle);
      if (!handle) return null;
      const title = asString(parsed.title);
      const priority = asPriority(parsed.priority);
      // deadline:null is meaningful ("clear the deadline"), so distinguish
      // between absent, explicitly null, and a string value. Any other type
      // (number, boolean, object) is malformed — treat as absent so a bad
      // value can't silently clear an existing deadline.
      const hasDeadline = Object.prototype.hasOwnProperty.call(parsed, "deadline");
      let deadline: string | null | undefined;
      if (!hasDeadline) {
        deadline = undefined;
      } else if (parsed.deadline === null) {
        deadline = null;
      } else if (typeof parsed.deadline === "string") {
        deadline = parsed.deadline;
      } else {
        deadline = undefined;
      }
      if (title === undefined && priority === undefined && deadline === undefined) {
        return null;
      }
      return { kind: "update", handle, title, priority, deadline };
    }
    case "add-goal": {
      const text = asString(parsed.text)?.trim();
      if (!text) return null;
      const description = typeof parsed.description === "string" ? parsed.description.trim() : undefined;
      const deadline = typeof parsed.deadline === "string" ? parsed.deadline : undefined;
      const priority = asPriority(parsed.priority);
      return { kind: "addGoal", text, description, deadline, priority };
    }
    case "update-goal": {
      const handle = asString(parsed.id ?? parsed.handle);
      if (!handle) return null;
      const text = typeof parsed.text === "string" ? parsed.text.trim() : undefined;
      const hasDescription = Object.prototype.hasOwnProperty.call(parsed, "description");
      const description = hasDescription
        ? parsed.description === null
          ? null
          : typeof parsed.description === "string"
            ? parsed.description.trim()
            : undefined
        : undefined;
      const hasDeadline = Object.prototype.hasOwnProperty.call(parsed, "deadline");
      const deadline = hasDeadline
        ? parsed.deadline === null
          ? null
          : typeof parsed.deadline === "string"
            ? parsed.deadline
            : undefined
        : undefined;
      const hasPriority = Object.prototype.hasOwnProperty.call(parsed, "priority");
      const priority = hasPriority
        ? parsed.priority === null
          ? null
          : asPriority(parsed.priority)
        : undefined;
      if (
        text === undefined &&
        description === undefined &&
        deadline === undefined &&
        priority === undefined
      ) {
        return null;
      }
      return { kind: "updateGoal", handle, text, description, deadline, priority };
    }
    case "delete-goal": {
      const handle = asString(parsed.id ?? parsed.handle);
      if (!handle) return null;
      return { kind: "deleteGoal", handle };
    }
    case "link-task-goal": {
      const taskHandle = asString(parsed.taskId ?? parsed.taskHandle);
      const goalHandle = asString(parsed.goalId ?? parsed.goalHandle);
      if (!taskHandle || !goalHandle) return null;
      return { kind: "linkTaskGoal", taskHandle, goalHandle };
    }
    case "unlink-task-goal": {
      const taskHandle = asString(parsed.taskId ?? parsed.taskHandle);
      if (!taskHandle) return null;
      return { kind: "unlinkTaskGoal", taskHandle };
    }
    default:
      return null;
  }
}

// ─── Native tool calling ──────────────────────────────────────────────────────
//
// Provider-agnostic conversation model + per-provider serializers. The agentic
// loop (kairoAgent.ts) keeps a neutral list of turns and re-serializes it each
// round, which is what lets the loop itself stay free of provider branching.
// The three providers differ in tool-call shape, tool-result feedback, and
// message envelope — those differences are isolated entirely to this section.

export interface NormalizedToolCall {
  /** Provider-assigned call id (Anthropic `tool_use.id`, OpenAI
   *  `tool_calls[].id`). Gemini has none, so we synthesize `${name}-${index}`.
   *  Echoed back in the matching tool result so providers can pair call↔result. */
  id: string;
  name: string;
  args: Record<string, unknown>;
}

export interface ToolResultEntry {
  /** Matches the originating NormalizedToolCall.id. */
  id: string;
  /** Tool name — Gemini pairs results by name rather than id. */
  name: string;
  /** JSON-serialized result payload fed back to the model. */
  content: string;
}

export type AgentTurn =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls: NormalizedToolCall[] }
  | { role: "tool"; results: ToolResultEntry[] };

export interface ToolCallExtraction {
  /** Assistant prose accompanying this turn — may be empty when the model
   *  emitted only tool calls. */
  text: string;
  toolCalls: NormalizedToolCall[];
}

const MAX_TOOL_TOKENS = 1024;

function coerceArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  // OpenAI serializes function arguments as a JSON string.
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* fall through to empty */
    }
  }
  return {};
}

/** Read both the assistant prose and any tool calls out of a provider response.
 *  Shapes differ per provider; everything downstream sees the normalized form. */
export function extractToolCalls(
  data: unknown,
  providerFormat: KairoProviderFormat
): ToolCallExtraction {
  if (!data || typeof data !== "object") return { text: "", toolCalls: [] };

  if (providerFormat === "anthropic") {
    const content = (data as { content?: unknown }).content;
    const blocks = Array.isArray(content) ? content : [];
    const toolCalls: NormalizedToolCall[] = [];
    blocks.forEach((b) => {
      if (b && typeof b === "object" && (b as { type?: string }).type === "tool_use") {
        const block = b as { id?: unknown; name?: unknown; input?: unknown };
        if (typeof block.name === "string") {
          toolCalls.push({
            id: typeof block.id === "string" ? block.id : `${block.name}-${toolCalls.length}`,
            name: block.name,
            args: coerceArgs(block.input),
          });
        }
      }
    });
    return { text: readAssistantText(blocks), toolCalls };
  }

  if (providerFormat === "gemini") {
    const candidates =
      (data as { candidates?: Array<{ content?: { parts?: unknown[] } }> }).candidates ?? [];
    const parts = candidates[0]?.content?.parts ?? [];
    const toolCalls: NormalizedToolCall[] = [];
    parts.forEach((p) => {
      if (p && typeof p === "object" && "functionCall" in p) {
        const fc = (p as { functionCall?: { name?: unknown; args?: unknown } }).functionCall;
        if (fc && typeof fc.name === "string") {
          toolCalls.push({
            id: `${fc.name}-${toolCalls.length}`,
            name: fc.name,
            args: coerceArgs(fc.args),
          });
        }
      }
    });
    return { text: readAssistantText(parts), toolCalls };
  }

  // openai
  const message = (
    data as { choices?: Array<{ message?: { content?: unknown; tool_calls?: unknown } }> }
  ).choices?.[0]?.message;
  const rawCalls = Array.isArray(message?.tool_calls) ? (message?.tool_calls as unknown[]) : [];
  const toolCalls: NormalizedToolCall[] = [];
  rawCalls.forEach((c, i) => {
    if (c && typeof c === "object") {
      const call = c as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
      const name = call.function?.name;
      if (typeof name === "string") {
        toolCalls.push({
          id: typeof call.id === "string" ? call.id : `${name}-${i}`,
          name,
          args: coerceArgs(call.function?.arguments),
        });
      }
    }
  });
  return { text: message ? readAssistantText(message.content) : "", toolCalls };
}

/** Serialize the neutral turn list into a provider request body, with tools
 *  attached. `tools` is the already-provider-shaped array from buildToolDefs. */
export function buildToolRequestBody(
  config: KairoConfig,
  systemPrompt: string,
  tools: unknown[],
  turns: AgentTurn[]
): Record<string, unknown> {
  if (config.providerFormat === "anthropic") {
    const messages = turns.map((turn) => {
      if (turn.role === "user") return { role: "user", content: turn.text };
      if (turn.role === "assistant") {
        const content: unknown[] = [];
        if (turn.text) content.push({ type: "text", text: turn.text });
        for (const tc of turn.toolCalls) {
          content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.args });
        }
        return { role: "assistant", content };
      }
      return {
        role: "user",
        content: turn.results.map((r) => ({
          type: "tool_result",
          tool_use_id: r.id,
          content: r.content,
        })),
      };
    });
    return {
      model: config.model,
      max_tokens: MAX_TOOL_TOKENS,
      system: systemPrompt,
      tools,
      messages,
    };
  }

  if (config.providerFormat === "gemini") {
    const contents = turns.map((turn) => {
      if (turn.role === "user") return { role: "user", parts: [{ text: turn.text }] };
      if (turn.role === "assistant") {
        const parts: unknown[] = [];
        if (turn.text) parts.push({ text: turn.text });
        for (const tc of turn.toolCalls) {
          parts.push({ functionCall: { name: tc.name, args: tc.args } });
        }
        return { role: "model", parts };
      }
      return {
        role: "user",
        parts: turn.results.map((r) => ({
          functionResponse: { name: r.name, response: { result: r.content } },
        })),
      };
    });
    return {
      generationConfig: { maxOutputTokens: MAX_TOOL_TOKENS },
      systemInstruction: { parts: [{ text: systemPrompt }] },
      tools,
      contents,
    };
  }

  // openai
  const messages: unknown[] = [{ role: "system", content: systemPrompt }];
  for (const turn of turns) {
    if (turn.role === "user") {
      messages.push({ role: "user", content: turn.text });
    } else if (turn.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant", content: turn.text || null };
      if (turn.toolCalls.length) {
        msg.tool_calls = turn.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        }));
      }
      messages.push(msg);
    } else {
      // Each tool result is its own `role:"tool"` message in the OpenAI shape.
      for (const r of turn.results) {
        messages.push({ role: "tool", tool_call_id: r.id, content: r.content });
      }
    }
  }
  return {
    model: config.model,
    max_completion_tokens: MAX_TOOL_TOKENS,
    messages,
    tools,
  };
}
