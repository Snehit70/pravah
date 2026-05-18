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
action in your response. Use the task handle (e.g. T3) from the context to
reference existing tasks. Every action is applied immediately and can be
undone by the user, so don't ask for confirmation in prose — just act.

<add-task>{"title":"...","scheduledDate":"YYYY-MM-DD or null for inbox","type":"open"}</add-task>
<reschedule-task>{"id":"T3","scheduledDate":"YYYY-MM-DD"}</reschedule-task>
<complete-task>{"id":"T3"}</complete-task>
<unschedule-task>{"id":"T3"}</unschedule-task>
<update-task>{"id":"T3","title":"...","priority":"p1"}</update-task>
<delete-task>{"id":"T3"}</delete-task>

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
};

/** Maps short handles surfaced to the model (e.g. "T12") back to real Convex
 *  task ids. Scoped to a single send: regenerated each turn so handles don't
 *  drift as the workspace changes. */
export type KairoIdMap = Record<string, string>;

export interface KairoContext {
  text: string;
  idMap: KairoIdMap;
}

export function buildKairoContext(
  allTasks: KairoTaskInput[],
  inboxTasks: KairoTaskInput[]
): KairoContext {
  const today = getLocalDateString();
  const scheduled = allTasks.filter((t) => t.status === "scheduled");
  const completed = allTasks.filter((t) => t.status === "completed");

  // Assign handles deterministically: scheduled tasks first (sorted by date,
  // then position-stable insertion order), then inbox. Stable ordering keeps
  // [T1] meaning the same task across the few seconds between context build
  // and action execution.
  const idMap: KairoIdMap = {};
  let nextHandle = 1;
  const handleFor = (task: KairoTaskInput): string => {
    const handle = `T${nextHandle++}`;
    idMap[handle] = task._id;
    return handle;
  };

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
          (t) =>
            `  - [${handleFor(t)}] "${t.title}"${t.type === "deadline" ? " [DEADLINE]" : ""}${t.priority ? ` [${t.priority.toUpperCase()}]` : ""}`
        )
        .join("\n");
      return `${label}:\n${taskList}`;
    })
    .join("\n\n");

  const inboxLines = inboxTasks.length
    ? inboxTasks.map((t) => `  - [${handleFor(t)}] "${t.title}"`).join("\n")
    : "  (empty)";

  const text = [
    `Today: ${today}`,
    "",
    "Scheduled tasks:",
    dateLines || "  (none)",
    "",
    `Inbox (${inboxTasks.length} items):`,
    inboxLines,
    "",
    `Completed this session: ${completed.length} tasks`,
  ].join("\n");

  return { text, idMap };
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
    max_tokens: 1024,
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

function readAssistantText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "type" in part &&
          "text" in part &&
          (part as { type?: string }).type === "text"
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
  | { kind: "delete"; handle: string };

const ACTION_TAG_RE =
  /<(add|reschedule|complete|unschedule|update|delete)-task>([\s\S]*?)<\/\1-task>/g;

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
      // between absent and explicitly null.
      const hasDeadline = Object.prototype.hasOwnProperty.call(parsed, "deadline");
      const deadline = hasDeadline
        ? typeof parsed.deadline === "string"
          ? parsed.deadline
          : null
        : undefined;
      if (title === undefined && priority === undefined && deadline === undefined) {
        return null;
      }
      return { kind: "update", handle, title, priority, deadline };
    }
    default:
      return null;
  }
}

/** Parse every <verb-task> block out of the assistant's raw text, returning
 *  the stripped message and an ordered list of actions. Malformed blocks
 *  (bad JSON, missing required fields) are silently dropped — same policy as
 *  the original add-only parser. */
export function extractKairoActions(rawText: string): {
  cleanText: string;
  actions: KairoAction[];
} {
  const actions: KairoAction[] = [];
  const cleanText = rawText
    .replace(ACTION_TAG_RE, (_, kind: string, json: string) => {
      try {
        const parsed = JSON.parse(json) as ParsedJson;
        const action = parseAction(kind, parsed);
        if (action) actions.push(action);
      } catch {
        /* skip malformed */
      }
      return "";
    })
    .trim();
  return { cleanText, actions };
}
