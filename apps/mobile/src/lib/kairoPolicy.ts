import type { KairoAction } from "./kairoApi";
import type { KairoActionResult } from "./kairoActions";

export interface KairoConfirmationPrompt {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export type KairoConfirm = (prompt: KairoConfirmationPrompt) => Promise<boolean>;

interface ConfirmedActionDeps {
  confirm: KairoConfirm;
  attemptedActionKeys: Set<string>;
  beforeTitleFor: (action: KairoAction) => string | null;
  apply: (action: KairoAction) => Promise<KairoActionResult | undefined>;
}

function taskLabel(beforeTitle: string | null) {
  return beforeTitle ? `"${beforeTitle}"` : "this task";
}

export function buildKairoConfirmation(
  action: KairoAction,
  beforeTitle: string | null
): KairoConfirmationPrompt {
  switch (action.kind) {
    case "add":
      return {
        title: "Add task?",
        message: action.scheduledDate
          ? `Add "${action.title}" on ${action.scheduledDate}?`
          : `Add "${action.title}" to the inbox?`,
        confirmLabel: "Add",
        cancelLabel: "Cancel",
      };
    case "reschedule":
      return {
        title: "Move task?",
        message: `Move ${taskLabel(beforeTitle)} to ${action.scheduledDate}?`,
        confirmLabel: "Move",
        cancelLabel: "Cancel",
      };
    case "complete":
      return {
        title: "Complete task?",
        message: `Mark ${taskLabel(beforeTitle)} complete?`,
        confirmLabel: "Complete",
        cancelLabel: "Cancel",
      };
    case "reopen":
      return {
        title: "Reopen task?",
        message: `Reopen ${taskLabel(beforeTitle)} to the inbox?`,
        confirmLabel: "Reopen",
        cancelLabel: "Cancel",
      };
    case "unschedule":
      return {
        title: "Send task to inbox?",
        message: `Unschedule ${taskLabel(beforeTitle)} and send it to the inbox?`,
        confirmLabel: "Send to inbox",
        cancelLabel: "Cancel",
      };
  }
}

export function kairoActionKey(action: KairoAction): string {
  switch (action.kind) {
    case "add":
      return ["add", action.title, action.scheduledDate ?? "", action.type].join("\u0000");
    case "reschedule":
      return ["reschedule", action.handle, action.scheduledDate].join("\u0000");
    case "complete":
    case "reopen":
    case "unschedule":
      return [action.kind, action.handle].join("\u0000");
  }
}

export async function applyConfirmedKairoActions(
  actions: KairoAction[],
  deps: ConfirmedActionDeps
): Promise<{ results: KairoActionResult[]; beforeTitles: (string | null)[] }> {
  const results: KairoActionResult[] = [];
  const beforeTitles: (string | null)[] = [];

  for (const action of actions) {
    const beforeTitle = deps.beforeTitleFor(action);
    const actionKey = kairoActionKey(action);
    beforeTitles.push(beforeTitle);

    if (deps.attemptedActionKeys.has(actionKey)) {
      results.push({
        action,
        status: "skipped",
        reason: "This action was already attempted in this request.",
      });
      continue;
    }
    deps.attemptedActionKeys.add(actionKey);

    if (!(await deps.confirm(buildKairoConfirmation(action, beforeTitle)))) {
      results.push({ action, status: "skipped", reason: "User declined this action." });
      continue;
    }

    const result = await deps.apply(action);
    results.push(
      result ?? {
        action,
        status: "failed",
        error: "The action executor returned no result.",
      }
    );
  }

  return { results, beforeTitles };
}
