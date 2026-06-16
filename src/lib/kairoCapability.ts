import { getLocalDateString } from "./utils";
import { isTaskCompleted, isTaskOnTimeline } from "./taskState";
import type { Task } from "../types";
import {
  parseKairoTaskProposals,
  updateKairoTaskProposal,
  type KairoTaskProposal,
  type ParsedKairoTaskProposals,
} from "./kairoTaskProposals";

export type { KairoTaskProposal, ParsedKairoTaskProposals };
export { parseKairoTaskProposals, updateKairoTaskProposal };

export type KairoMessageRole = "me" | "kairo";

export interface KairoCapabilityMessage {
  from: KairoMessageRole;
  text: string;
  tasks?: KairoTaskProposal[];
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
<add-task>{"title":"<title>","deadline":"<YYYY-MM-DD or null for inbox>"}</add-task>

Guidelines:
- Be direct and warm, not corporate or verbose
- Give one clear recommendation before listing alternatives
- Acknowledge what's already done before suggesting more work
- Flag honestly when a day looks overloaded ("Tuesday already has 4 tasks")
- Format answers as compact Markdown that this UI can render: short paragraphs, **bold** labels, \`inline code\` for dates/times/model names, and bullet lists only when there are 2-5 concrete items
- For schedule analysis, use this shape: one sentence summary, then bullets starting with **Now**, **Risk**, or **Next**
- Keep responses short — 2-4 sentences for simple questions, 3-5 bullets max for analysis
- Never make up tasks or details not present in the context`;

export function buildKairoContext(tasks: Task[], inboxTasks: Task[]): string {
  const today = getLocalDateString();
  const scheduled = tasks.filter(isTaskOnTimeline);
  const completed = tasks.filter(isTaskCompleted);

  const byDate: Record<string, Task[]> = {};
  for (const task of scheduled) {
    const date = task.deadline;
    if (!date) continue;
    (byDate[date] ||= []).push(task);
  }

  const dateLines = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayTasks]) => {
      const label = date === today ? `${date} (TODAY)` : date;
      const taskList = dayTasks
        .map(
          (task) =>
            `  - "${task.title}"${task.deadline ? " [DEADLINE]" : ""}${task.priority ? ` [${task.priority.toUpperCase()}]` : ""}`
        )
        .join("\n");
      return `${label}:\n${taskList}`;
    })
    .join("\n\n");

  const inboxLines = inboxTasks.length
    ? inboxTasks.map((task) => `  - "${task.title}"`).join("\n")
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

export function buildKairoSystemPrompt(tasks: Task[], inboxTasks: Task[]): string {
  return KAIRO_SYSTEM_PROMPT.replace("{CONTEXT}", buildKairoContext(tasks, inboxTasks));
}

export function buildKairoHistory(messages: KairoCapabilityMessage[]) {
  return messages.slice(1).map((message) => ({
    role: message.from === "me" ? "user" : "assistant",
    content: message.text,
  }));
}
