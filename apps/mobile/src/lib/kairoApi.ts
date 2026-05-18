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
}

export interface KairoTaskBlock {
  title: string;
  scheduledDate: string | null;
  type: "open" | "deadline";
}

export const KAIRO_SYSTEM_PROMPT = `You are Kairo, an intelligent work orchestration assistant embedded in Pravah — a timeline-first task management tool. Your role is to help the user manage their schedule, think through priorities, and keep their week intentional.

You have the following information about the user's current state:
{CONTEXT}

Your capabilities:
- Analyze the schedule and surface overdue items, conflicts, or overloaded days
- Suggest tasks for specific days based on what you know about workload and goals
- Help the user prioritize by reasoning about deadlines and importance
- Summarize recent progress and forward-looking pressure
- Move tasks around or help the user triage the inbox
- Answer schedule questions ("What's happening Thursday?", "Am I free Friday?")

When you decide to add a task, include a structured block in your response — one per task:
<add-task>{"title":"<title>","scheduledDate":"<YYYY-MM-DD or null for inbox>","type":"open"}</add-task>

Guidelines:
- Be direct and warm, not corporate or verbose
- Give one clear recommendation before listing alternatives
- Acknowledge what's already done before suggesting more work
- Flag honestly when a day looks overloaded ("Tuesday already has 4 tasks")
- Keep responses short — 2-4 sentences for simple questions, 3-5 bullets max for analysis
- Never make up tasks or details not present in the context`;

export type KairoTaskInput = {
  title: string;
  scheduledDate?: string;
  status: "inbox" | "scheduled" | "completed" | "cancelled";
  priority?: "p1" | "p2" | "p3";
  type?: "open" | "deadline";
};

export function buildKairoContext(allTasks: KairoTaskInput[], inboxTasks: KairoTaskInput[]): string {
  const today = getLocalDateString();
  const scheduled = allTasks.filter((t) => t.status === "scheduled");
  const completed = allTasks.filter((t) => t.status === "completed");

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
            `  - "${t.title}"${t.type === "deadline" ? " [DEADLINE]" : ""}${t.priority ? ` [${t.priority.toUpperCase()}]` : ""}`
        )
        .join("\n");
      return `${label}:\n${taskList}`;
    })
    .join("\n\n");

  const inboxLines = inboxTasks.length
    ? inboxTasks.map((t) => `  - "${t.title}"`).join("\n")
    : "  (empty)";

  return [
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
