/**
 * Kairo tool catalog
 *
 * The provider-agnostic tool surface for the agentic loop:
 *   - JSON-schema definitions for every read + mutation tool
 *   - `buildToolDefs` wraps those schemas in each provider's tool shape
 *   - a per-send handle registry (`[T#]`/`[G#]`) that read tools append to
 *   - `runReadTool` — local, synchronous executors that filter the in-memory
 *     workspace (no Convex round-trip; the full corpus is already loaded)
 *   - `toolCallToAction` — maps a mutation tool call onto the canonical
 *     `KairoAction`, reusing `parseAction` so validation stays single-sourced
 *
 * Mutation tools are NOT executed here — they map to `KairoAction`s and run
 * through the stateful action executor, keeping the undo system untouched.
 */

import {
  parseAction,
  type KairoAction,
  type KairoGoalInput,
  type KairoIdMap,
  type KairoTaskInput,
} from "./kairoApi";
import type { KairoProviderFormat } from "./kairoConfig";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export interface KairoToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const str = (description: string) => ({ type: "string", description });
const date = (description: string) => ({
  type: "string",
  pattern: "^\\d{4}-\\d{2}-\\d{2}$",
  description,
});
export const KAIRO_READ_TOOLS: KairoToolSchema[] = [
  {
    name: "get_inbox",
    description: "List all unscheduled inbox tasks with their handles.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "get_tasks_in_range",
    description:
      "List scheduled tasks between two dates inclusive. Use the same date for both to get a single day; spans cover week views.",
    parameters: {
      type: "object",
      properties: {
        startDate: date("Start date, YYYY-MM-DD"),
        endDate: date("End date, YYYY-MM-DD"),
      },
      required: ["startDate", "endDate"],
    },
  },
  {
    name: "get_overdue",
    description: "List scheduled tasks dated before today.",
    parameters: { type: "object", properties: {} },
  },
  {
    name: "search_tasks",
    description:
      "Find tasks whose title contains the query (case-insensitive), across all dates and the inbox.",
    parameters: {
      type: "object",
      properties: { query: str("Text to match in task titles") },
      required: ["query"],
    },
  },
  {
    name: "get_completed",
    description:
      "List completed tasks, optionally filtered by completion date (YYYY-MM-DD). Useful for progress summaries.",
    parameters: {
      type: "object",
      properties: {
        startDate: date("Optional start date, YYYY-MM-DD"),
        endDate: date("Optional end date, YYYY-MM-DD"),
      },
    },
  },
];

export const KAIRO_MUTATION_TOOLS: KairoToolSchema[] = [
  {
    name: "add_task",
    description: "Create a task. Omit deadline to put it in the inbox.",
    parameters: {
      type: "object",
      properties: {
        title: { ...str("Task title"), maxLength: 500 },
        deadline: date("Deadline YYYY-MM-DD, or omit for inbox"),
      },
      required: ["title"],
    },
  },
  {
    name: "reschedule_task",
    description: "Move a task to a different date.",
    parameters: {
      type: "object",
      properties: {
        handle: str("Task handle, e.g. T3"),
        deadline: date("New deadline, YYYY-MM-DD"),
      },
      required: ["handle", "deadline"],
    },
  },
  {
    name: "complete_task",
    description: "Mark a task done.",
    parameters: { type: "object", properties: { handle: str("Task handle") }, required: ["handle"] },
  },
  {
    name: "reopen_task",
    description: "Reopen a completed task, preserving its deadline when present.",
    parameters: { type: "object", properties: { handle: str("Task handle") }, required: ["handle"] },
  },
  {
    name: "unschedule_task",
    description: "Send a scheduled task back to the inbox.",
    parameters: { type: "object", properties: { handle: str("Task handle") }, required: ["handle"] },
  },
];

export const KAIRO_ALL_TOOLS: KairoToolSchema[] = [
  ...KAIRO_READ_TOOLS,
  ...KAIRO_MUTATION_TOOLS,
];

/** Wrap the shared schemas in each provider's tool-definition shape. Gemini
 *  nests every declaration under a single `functionDeclarations` entry; the
 *  others expose a flat array of tool objects. */
export function buildToolDefs(providerFormat: KairoProviderFormat): unknown[] {
  if (providerFormat === "anthropic") {
    return KAIRO_ALL_TOOLS.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    }));
  }
  if (providerFormat === "gemini") {
    return [
      {
        functionDeclarations: KAIRO_ALL_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];
  }
  return KAIRO_ALL_TOOLS.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

// ─── Handle registry ──────────────────────────────────────────────────────────

export interface HandleRegistry {
  /** handle → real Convex task id (consumed by the action executor). */
  taskIdMap: KairoIdMap;
  /** handle → real goal client id. */
  goalIdMap: KairoIdMap;
  /** Mint or reuse a `[T#]` handle for a task id. Stable within a send. */
  handleForTask: (taskId: string) => string;
  /** Mint or reuse a `[G#]` handle for a goal id. */
  handleForGoal: (goalId: string) => string;
}

export function createHandleRegistry(): HandleRegistry {
  const taskIdMap: KairoIdMap = {};
  const goalIdMap: KairoIdMap = {};
  const taskHandleById = new Map<string, string>();
  const goalHandleById = new Map<string, string>();
  let nextTask = 1;
  let nextGoal = 1;
  return {
    taskIdMap,
    goalIdMap,
    handleForTask(taskId) {
      const existing = taskHandleById.get(taskId);
      if (existing) return existing;
      const handle = `T${nextTask++}`;
      taskHandleById.set(taskId, handle);
      taskIdMap[handle] = taskId;
      return handle;
    },
    handleForGoal(goalId) {
      const existing = goalHandleById.get(goalId);
      if (existing) return existing;
      const handle = `G${nextGoal++}`;
      goalHandleById.set(goalId, handle);
      goalIdMap[handle] = goalId;
      return handle;
    },
  };
}

// ─── Thin context ─────────────────────────────────────────────────────────────

export interface KairoThinContextEnv {
  /** All loaded tasks across tabs. */
  tasks: KairoTaskInput[];
  /** Inbox tasks (for the count). */
  inboxTasks: KairoTaskInput[];
  goals: KairoGoalInput[];
  /** taskId → goalId. */
  goalLinks: Record<string, string>;
  registry: HandleRegistry;
  today: string;
}

/** Build the slim always-on context injected into the agent system prompt:
 *  today's tasks, goals, and counts — with handles seeded into the registry.
 *  Everything else is reachable through read tools, so the prompt stays small
 *  and the per-round token cost stays bounded regardless of corpus size. */
export function buildThinContext(env: KairoThinContextEnv): string {
  const { tasks, inboxTasks, goals, goalLinks, registry, today } = env;
  const scheduled = tasks.filter(
    (task) =>
      task.completedAt === undefined &&
      task.cancelledAt === undefined &&
      !!task.deadline
  );
  const todayTasks = scheduled.filter((t) => t.deadline === today);
  const overdueCount = scheduled.filter(
    (t) => t.deadline !== undefined && t.deadline < today
  ).length;

  const todayLines = todayTasks.length
    ? todayTasks
        .map(
          (t) =>
            `  - [${registry.handleForTask(t._id)}] "${t.title}"${
              t.priority ? ` [${t.priority.toUpperCase()}]` : ""
            }`
        )
        .join("\n")
    : "  (none)";

  const sortedGoals = [...goals].sort(
    (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0) || a.text.localeCompare(b.text)
  );
  const goalLines = sortedGoals.length
    ? sortedGoals
        .map((g) => {
          const handle = registry.handleForGoal(g.id);
          const linkedTaskId = Object.entries(goalLinks).find(([, gid]) => gid === g.id)?.[0];
          const linkedLabel = linkedTaskId
            ? ` [LINKED:${registry.handleForTask(linkedTaskId)}]`
            : "";
          return `  - [${handle}] "${g.text}"${g.priority ? ` [${g.priority.toUpperCase()}]` : ""}${
            g.deadline ? ` [DUE:${g.deadline}]` : ""
          }${linkedLabel}`;
        })
        .join("\n")
    : "  (none)";

  return [
    `Today: ${today}`,
    "",
    "Today's scheduled tasks:",
    todayLines,
    "",
    "Goals:",
    goalLines,
    "",
    `Counts: inbox ${inboxTasks.length}, overdue ${overdueCount}, scheduled total ${scheduled.length}.`,
  ].join("\n");
}

// ─── Read-tool execution ──────────────────────────────────────────────────────

export interface KairoReadEnv {
  /** All loaded tasks across tabs (scheduled + completed live here). */
  tasks: KairoTaskInput[];
  /** Inbox tasks (a separate query in the parent). */
  inboxTasks: KairoTaskInput[];
  registry: HandleRegistry;
  /** Local-date string for overdue comparisons. */
  today: string;
}

interface TaskSummary {
  handle: string;
  title: string;
  state: "inbox" | "timeline" | "completed" | "cancelled";
  priority?: "p1" | "p2" | "p3";
  deadline?: string;
}

export interface ReadToolResult {
  /** True when the tool name was recognized and ran. */
  ok: boolean;
  /** Serializable payload fed back to the model. */
  data?: unknown;
  error?: string;
}

const SEARCH_LIMIT = 25;

function summarize(task: KairoTaskInput, registry: HandleRegistry): TaskSummary {
  const summary: TaskSummary = {
    handle: registry.handleForTask(task._id),
    title: task.title,
    state: task.cancelledAt !== undefined
      ? "cancelled"
      : task.completedAt !== undefined
        ? "completed"
        : task.deadline
          ? "timeline"
          : "inbox",
  };
  if (task.priority) summary.priority = task.priority;
  if (task.deadline) summary.deadline = task.deadline;
  return summary;
}

function dedupeById(tasks: KairoTaskInput[]): KairoTaskInput[] {
  const seen = new Set<string>();
  const out: KairoTaskInput[] = [];
  for (const t of tasks) {
    if (seen.has(t._id)) continue;
    seen.add(t._id);
    out.push(t);
  }
  return out;
}

const asDate = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const timestampDate = (value: number): string => {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate()
  ).padStart(2, "0")}`;
};

/** Run a read tool against the in-memory workspace. Pure and synchronous —
 *  every returned task is registered into the handle map so the model can act
 *  on what it read in a later round. */
export function runReadTool(
  name: string,
  args: Record<string, unknown>,
  env: KairoReadEnv
): ReadToolResult {
  const { tasks, inboxTasks, registry, today } = env;
  const toSummaries = (list: KairoTaskInput[]) => list.map((t) => summarize(t, registry));

  switch (name) {
    case "get_inbox":
      return { ok: true, data: { tasks: toSummaries(inboxTasks) } };

    case "get_tasks_in_range": {
      const start = asDate(args.startDate);
      const end = asDate(args.endDate);
      if (!start || !end) {
        return { ok: false, error: "startDate and endDate are required (YYYY-MM-DD)." };
      }
      const [lo, hi] = start <= end ? [start, end] : [end, start];
      const matched = tasks
        .filter(
          (t) =>
            t.completedAt === undefined &&
            t.cancelledAt === undefined &&
            t.deadline !== undefined &&
            t.deadline >= lo &&
            t.deadline <= hi
        )
        .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
      return { ok: true, data: { tasks: toSummaries(matched) } };
    }

    case "get_overdue": {
      const matched = tasks
        .filter(
          (t) =>
            t.completedAt === undefined &&
            t.cancelledAt === undefined &&
            t.deadline !== undefined &&
            t.deadline < today
        )
        .sort((a, b) => (a.deadline ?? "").localeCompare(b.deadline ?? ""));
      return { ok: true, data: { tasks: toSummaries(matched) } };
    }

    case "search_tasks": {
      const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
      if (!query) return { ok: false, error: "query is required." };
      const matched = dedupeById([...tasks, ...inboxTasks])
        .filter((t) => t.title.toLowerCase().includes(query))
        .slice(0, SEARCH_LIMIT);
      return {
        ok: true,
        data: { tasks: toSummaries(matched), truncated: matched.length === SEARCH_LIMIT },
      };
    }

    case "get_completed": {
      const start = asDate(args.startDate);
      const end = asDate(args.endDate);
      const matched = tasks.filter((t) => {
        if (t.completedAt === undefined || t.cancelledAt !== undefined) return false;
        const completedDate = timestampDate(t.completedAt);
        if (start && completedDate < start) return false;
        if (end && completedDate > end) return false;
        return true;
      });
      return { ok: true, data: { tasks: toSummaries(matched) } };
    }

    default:
      return { ok: false, error: `Unknown read tool "${name}".` };
  }
}

// ─── Mutation tool → KairoAction ──────────────────────────────────────────────

const MUTATION_TOOL_TO_KIND: Record<string, string> = {
  add_task: "add",
  reschedule_task: "reschedule",
  complete_task: "complete",
  reopen_task: "reopen",
  unschedule_task: "unschedule",
};

export function isReadTool(name: string): boolean {
  return KAIRO_READ_TOOLS.some((t) => t.name === name);
}

export function isMutationTool(name: string): boolean {
  return name in MUTATION_TOOL_TO_KIND;
}

/** Convert a mutation tool call into the canonical KairoAction. Returns null
 *  for unknown or malformed calls so the caller can surface a skipped result. */
export function toolCallToAction(
  name: string,
  args: Record<string, unknown>
): KairoAction | null {
  const kind = MUTATION_TOOL_TO_KIND[name];
  if (!kind) return null;
  return parseAction(kind, args);
}
