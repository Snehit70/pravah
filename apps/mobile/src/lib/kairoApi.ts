import type { KairoConfig, KairoProviderFormat } from "./kairoConfig";
import { getLocalDateString } from "./dates";

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

export const KAIRO_SYSTEM_PROMPT = `You are Kairo, an intelligent work orchestration assistant embedded in Pravah — a timeline-first task management tool. Your role is to help the user manage their schedule, think through priorities, and keep their week intentional.

You have the following information about the user's current state. Each task
is prefixed with a short handle in square brackets like [T3]. Use that handle
verbatim whenever you reference or act on a task — never invent handles, never
mention them in prose to the user (they are internal).

{CONTEXT}

Your capabilities:
- Analyze the schedule and surface overdue items, conflicts, or overloaded days
- Suggest tasks for specific days based on what you know about workload and goals
- Help the user prioritize by reasoning about deadlines and importance
- Summarize recent progress and forward-looking pressure
- Move tasks around or help the user triage the inbox
- Answer schedule questions ("What's happening Thursday?", "Am I free Friday?")

When you decide to act on the user's behalf, include one structured block per
action in your response. Use task handles (e.g. T3) and goal handles (e.g. G1)
from the context exactly as shown. Every action is applied immediately and can
be undone by the user, so don't ask for confirmation in prose — just act.

CRITICAL — action format rules:
- Actions ONLY execute when you emit the exact XML tag shown below. Any other
  format (JSON blobs, mutation logs, pseudo-code, prose descriptions) is
  completely ignored by the system — the action will NOT run.
- Never write raw JSON outside a tag, never simulate mutation logs or request
  IDs, never describe what you "called" or "sent". If the tag isn't present,
  nothing happens.
- If you intend to delete a task, emit the tag. Do not say you deleted it unless
  the tag is present in your response.

<add-task>{"title":"...","scheduledDate":"YYYY-MM-DD or null for inbox","type":"open"}</add-task>
<reschedule-task>{"id":"T3","scheduledDate":"YYYY-MM-DD"}</reschedule-task>
<complete-task>{"id":"T3"}</complete-task>
<unschedule-task>{"id":"T3"}</unschedule-task>
<update-task>{"id":"T3","title":"...","priority":"p1"}</update-task>
<delete-task>{"id":"T3"}</delete-task>
<add-goal>{"text":"...","description":"optional","deadline":"YYYY-MM-DD","priority":"p1"}</add-goal>
<update-goal>{"id":"G1","text":"...","description":"optional or null","deadline":"YYYY-MM-DD or null","priority":"p1 or null"}</update-goal>
<delete-goal>{"id":"G1"}</delete-goal>
<link-task-goal>{"taskId":"T3","goalId":"G1"}</link-task-goal>
<unlink-task-goal>{"taskId":"T3"}</unlink-task-goal>

Guidelines:
- Be direct and warm, not corporate or verbose
- Give one clear recommendation before listing alternatives
- Acknowledge what's already done before suggesting more work
- Flag honestly when a day looks overloaded ("Tuesday already has 4 tasks")
- Keep responses short — 2-4 sentences for simple questions, 3-5 bullets max for analysis
- Never make up tasks or details not present in the context`;

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

export interface KairoContext {
  text: string;
  taskIdMap: KairoIdMap;
  goalIdMap: KairoIdMap;
}

export function buildKairoContext(
  allTasks: KairoTaskInput[],
  inboxTasks: KairoTaskInput[],
  goals: KairoGoalInput[],
  links: Record<string, string>
): KairoContext {
  const today = getLocalDateString();
  const scheduled = allTasks.filter((t) => t.status === "scheduled");
  const completed = allTasks.filter((t) => t.status === "completed");

  // Assign handles deterministically: scheduled tasks first (sorted by date,
  // then position-stable insertion order), then inbox. Stable ordering keeps
  // [T1] meaning the same task across the few seconds between context build
  // and action execution.
  const taskIdMap: KairoIdMap = {};
  let nextTaskHandle = 1;
  const handleFor = (task: KairoTaskInput): string => {
    const handle = `T${nextTaskHandle++}`;
    taskIdMap[handle] = task._id;
    return handle;
  };
  const taskHandleById: Record<string, string> = {};

  const byDate: Record<string, KairoTaskInput[]> = {};
  for (const t of scheduled) {
    if (!t.scheduledDate) continue;
    (byDate[t.scheduledDate] ||= []).push(t);
  }

  const dateLines = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, ts]) => {
      const label = date === today ? `${date} (TODAY)` : date;
      const taskList = ts
        .map(
          (t) => {
            const handle = handleFor(t);
            taskHandleById[t._id] = handle;
            return `  - [${handle}] "${t.title}"${t.type === "deadline" ? " [DEADLINE]" : ""}${t.priority ? ` [${t.priority.toUpperCase()}]` : ""}`;
          }
        )
        .join("\n");
      return `${label}:\n${taskList}`;
    })
    .join("\n\n");

  const inboxLines = inboxTasks.length
    ? inboxTasks
        .map((t) => {
          const handle = handleFor(t);
          taskHandleById[t._id] = handle;
          return `  - [${handle}] "${t.title}"`;
        })
        .join("\n")
    : "  (empty)";

  const goalIdMap: KairoIdMap = {};
  let nextGoalHandle = 1;
  const sortedGoals = [...goals].sort((a, b) =>
    (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.text.localeCompare(b.text)
  );
  const goalLines = sortedGoals.length
    ? sortedGoals
        .map((g) => {
          const handle = `G${nextGoalHandle++}`;
          goalIdMap[handle] = g.id;
          const linkedTaskHandle = Object.entries(links).find(([, gid]) => gid === g.id)?.[0];
          const linkedTaskLabel = linkedTaskHandle
            ? ` [LINKED:${taskHandleById[linkedTaskHandle] ?? linkedTaskHandle}]`
            : "";
          return `  - [${handle}] "${g.text}"${g.priority ? ` [${g.priority.toUpperCase()}]` : ""}${g.deadline ? ` [DUE:${g.deadline}]` : ""}${linkedTaskLabel}`;
        })
        .join("\n")
    : "  (none)";

  const text = [
    `Today: ${today}`,
    "",
    "Scheduled tasks:",
    dateLines || "  (none)",
    "",
    `Inbox (${inboxTasks.length} items):`,
    inboxLines,
    "",
    `Goals (${sortedGoals.length} items):`,
    goalLines,
    "",
    `Completed this session: ${completed.length} tasks`,
  ].join("\n");

  return { text, taskIdMap, goalIdMap };
}

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

type ChatTurn = { role: "user" | "assistant"; content: string };

export function buildOpenAIRequestBody(
  config: KairoConfig,
  systemPrompt: string,
  history: ChatTurn[],
  text: string
) {
  return {
    model: config.model,
    max_completion_tokens: 1024,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: text },
    ],
  };
}

export function buildAnthropicRequestBody(
  config: KairoConfig,
  systemPrompt: string,
  history: ChatTurn[],
  text: string
) {
  return {
    model: config.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [...history, { role: "user", content: text }],
  };
}

export function buildGeminiRequestBody(
  config: KairoConfig,
  systemPrompt: string,
  history: ChatTurn[],
  text: string
) {
  const contents = [
    ...history.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    })),
    { role: "user", parts: [{ text }] },
  ];
  return {
    generationConfig: {
      maxOutputTokens: 1024,
    },
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    contents,
  };
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

export function readKairoResponseText(data: unknown, providerFormat: KairoProviderFormat): string {
  if (!data || typeof data !== "object") return "";
  if (providerFormat === "gemini") {
    const candidates = (data as { candidates?: Array<{ content?: { parts?: unknown[] } }> }).candidates ?? [];
    const parts = candidates[0]?.content?.parts ?? [];
    return readAssistantText(parts);
  }
  if (providerFormat === "anthropic" && "content" in data) {
    return readAssistantText((data as { content?: unknown }).content);
  }
  return readAssistantText(
    (data as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content
  );
}

/** Strips <add-task> blocks from the assistant's text and returns both the
 *  cleaned message and the parsed task payloads. Mirrors web's inline parse
 *  at Kairo.tsx:602-616. */
export function extractTaskBlocks(rawText: string): { cleanText: string; tasks: KairoTaskBlock[] } {
  const tasks: KairoTaskBlock[] = [];
  const cleanText = rawText
    .replace(/<add-task>([\s\S]*?)<\/add-task>/g, (_, json: string) => {
      try {
        const parsed = JSON.parse(json) as {
          title?: string;
          scheduledDate?: string | null;
          type?: string;
        };
        if (parsed.title) {
          tasks.push({
            title: parsed.title,
            scheduledDate: parsed.scheduledDate ?? null,
            type: parsed.type === "deadline" ? "deadline" : "open",
          });
        }
      } catch {
        /* skip malformed */
      }
      return "";
    })
    .trim();
  return { cleanText, tasks };
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

// The closing slash is optionally backslash-escaped to tolerate models that
// emit `<\/delete-task>` (sometimes mimicking regex/HTML escaping seen in
// training data). Without this, the tag isn't matched, no action runs, and the
// raw XML leaks into the chat bubble.
const ACTION_TAG_RE =
  /<(add|reschedule|complete|unschedule|update|delete)-task>([\s\S]*?)<\\?\/\1-task>|<(add|update|delete)-goal>([\s\S]*?)<\\?\/\3-goal>|<(link-task-goal|unlink-task-goal)>([\s\S]*?)<\\?\/\5>/g;

type ParsedJson = Record<string, unknown>;

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asPriority(v: unknown): "p1" | "p2" | "p3" | undefined {
  return v === "p1" || v === "p2" || v === "p3" ? v : undefined;
}

function parseAction(kind: string, parsed: ParsedJson): KairoAction | null {
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

/** Parse every <verb-task> block out of the assistant's raw text, returning
 *  the stripped message and an ordered list of actions. Malformed blocks
 *  (bad JSON, missing required fields) are silently dropped — same policy as
 *  the original add-only parser. */
// Lines the model sometimes emits when it hallucinates a mutation-log format
// instead of using the XML action tags. Stripping them prevents the garbage
// from being stored in chat history and compounding the problem across turns.
const LEAKED_ARTIFACT_RE =
  /^\s*(\[CONVEX\s.*\]|\[REQUEST\s+ID:.*\]|\{"id"\s*:\s*"T\d+"\s*\})\s*$/gim;

export function extractKairoActions(rawText: string): {
  cleanText: string;
  actions: KairoAction[];
} {
  const actions: KairoAction[] = [];
  const cleanText = rawText
    .replace(
      ACTION_TAG_RE,
      (
        _,
        taskKind: string | undefined,
        taskJson: string | undefined,
        goalKind: string | undefined,
        goalJson: string | undefined,
        linkKind: string | undefined,
        linkJson: string | undefined
      ) => {
        const kind = taskKind ? `${taskKind}` : goalKind ? `${goalKind}-goal` : linkKind ?? "";
        const json = taskJson ?? goalJson ?? linkJson ?? "";
      try {
        const parsed = JSON.parse(json) as ParsedJson;
        const action = parseAction(kind, parsed);
        if (action) actions.push(action);
      } catch {
        /* skip malformed */
      }
      return "";
      }
    )
    .replace(LEAKED_ARTIFACT_RE, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleanText, actions };
}
