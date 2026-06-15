/// <reference types="node" />
import { randomUUID } from "node:crypto";
import { hasFlag, readOption } from "./args";
import type { ParsedArgs } from "./types";

const TASK_STATUSES = [
  "inbox",
  "timeline",
  "completed",
  "cancelled",
  "scheduled",
] as const;
const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
const TASK_PRIORITIES = ["p1", "p2", "p3"] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
type OptionKind = "flag" | "value";

const GLOBAL_OPTIONS: Record<string, OptionKind> = {
  json: "flag",
};
const WRITE_OPTIONS: Record<string, OptionKind> = {
  "dry-run": "flag",
  "idempotency-key": "value",
};
const TASK_ID_WRITE_OPTIONS: Record<string, OptionKind> = {
  "task-id": "value",
  ...WRITE_OPTIONS,
};

const COMMAND_OPTIONS: Record<string, Record<string, OptionKind>> = {
  "auth import": {
    "bootstrap-token": "value",
    "credential-file": "value",
  },
  "auth whoami": {},
  "auth list-scopes": {},
  "goals list": {},
  "goals update": {
    "goal-id": "value",
    description: "value",
    deadline: "value",
    priority: "value",
    ...WRITE_OPTIONS,
  },
  "tasks list": { status: "value", date: "value" },
  "tasks inbox": {},
  "tasks timeline": { "end-date": "value" },
  "review list": { status: "value", limit: "value" },
  "sync status": { provider: "value" },
  "agent context": {},
  "agent task": { "task-id": "value" },
  "tasks add": {
    title: "value",
    description: "value",
    deadline: "value",
    priority: "value",
    tags: "value",
    "estimated-minutes": "value",
    ...WRITE_OPTIONS,
  },
  "tasks move": {
    "target-date": "value",
    ...TASK_ID_WRITE_OPTIONS,
  },
  "tasks complete": TASK_ID_WRITE_OPTIONS,
  "tasks reopen": TASK_ID_WRITE_OPTIONS,
  "tasks unschedule": TASK_ID_WRITE_OPTIONS,
};

export function validateCommandArgs(command: string, args: ParsedArgs) {
  if (args.positionals.length !== 2) {
    throw new Error(`Unexpected positional arguments for ${command}`);
  }
  const commandOptions = COMMAND_OPTIONS[command];
  if (!commandOptions) return;

  for (const [key, value] of Object.entries(args.options)) {
    const kind = commandOptions[key] ?? GLOBAL_OPTIONS[key];
    if (!kind) {
      throw new Error(`Unknown option --${key} for ${command}`);
    }
    if (kind === "flag" && value !== true) {
      throw new Error(`Option --${key} does not accept a value`);
    }
    if (kind === "value" && value === true) {
      throw new Error(`Option --${key} requires a value`);
    }
  }
}

export function requireOption(
  args: ParsedArgs,
  key: string,
  command: string
): string {
  const value = readOption(args.options, key);
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`Missing required option --${key} for ${command}`);
  }
  return normalized;
}

export function getWriteMetadata(args: ParsedArgs) {
  const rawIdempotencyKey = readOption(args.options, "idempotency-key");
  let idempotencyKey = `cli_${randomUUID()}`;
  if (rawIdempotencyKey !== undefined) {
    idempotencyKey = rawIdempotencyKey.trim();
    if (!idempotencyKey || idempotencyKey.length > 200) {
      throw new Error("--idempotency-key must be between 1 and 200 characters");
    }
  }
  return {
    dryRun: hasFlag(args.options, "dry-run"),
    idempotencyKey,
  };
}

function normalizeGoalUpdateValue(
  value: string | undefined,
  {
    fieldName,
    allowClear = false,
  }: { fieldName: string; allowClear?: boolean }
) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`--${fieldName} requires a value`);
  }
  if (allowClear && ["clear", "none", "null"].includes(normalized.toLowerCase())) {
    return null;
  }
  return normalized;
}

export function readGoalUpdateOptions(args: ParsedArgs) {
  const description = normalizeGoalUpdateValue(readOption(args.options, "description"), {
    fieldName: "description",
    allowClear: true,
  });
  const deadline = normalizeGoalUpdateValue(readOption(args.options, "deadline"), {
    fieldName: "deadline",
    allowClear: true,
  });
  if (deadline !== undefined && deadline !== null && !DATE_PATTERN.test(deadline)) {
    throw new Error("--deadline must use YYYY-MM-DD format, or `clear`");
  }

  const rawPriority = normalizeGoalUpdateValue(readOption(args.options, "priority"), {
    fieldName: "priority",
    allowClear: true,
  });
  const priority: "p1" | "p2" | "p3" | null | undefined =
    rawPriority === null || rawPriority === undefined
      ? rawPriority
      : rawPriority === "p1" || rawPriority === "p2" || rawPriority === "p3"
        ? rawPriority
        : undefined;
  if (
    rawPriority !== undefined &&
    rawPriority !== null &&
    priority === undefined
  ) {
    throw new Error("--priority must be one of: p1, p2, p3, or `clear`");
  }

  if (description === undefined && deadline === undefined && priority === undefined) {
    throw new Error(
      "goals update requires at least one of --description, --deadline, or --priority"
    );
  }

  return {
    description,
    deadline,
    priority,
  };
}

export function readTaskListFilters(args: ParsedArgs) {
  const rawStatus = readOption(args.options, "status");
  const date = readOption(args.options, "date");
  if (
    rawStatus &&
    !TASK_STATUSES.includes(rawStatus as (typeof TASK_STATUSES)[number])
  ) {
    throw new Error(`--status must be one of: ${TASK_STATUSES.join(", ")}`);
  }
  if (date && !DATE_PATTERN.test(date)) {
    throw new Error("--date must use YYYY-MM-DD format");
  }
  const status =
    rawStatus === undefined
      ? undefined
      : rawStatus === "scheduled"
        ? "timeline"
        : rawStatus;
  return { status, date };
}

export function readReviewListOptions(args: ParsedArgs) {
  const status = readOption(args.options, "status");
  if (status && !REVIEW_STATUSES.includes(status as (typeof REVIEW_STATUSES)[number])) {
    throw new Error(`--status must be one of: ${REVIEW_STATUSES.join(", ")}`);
  }

  const rawLimit = readOption(args.options, "limit");
  if (!rawLimit) return { status, limit: undefined };
  const limit = Number(rawLimit);
  if (!Number.isInteger(limit) || limit <= 0 || limit > 200) {
    throw new Error("--limit must be an integer between 1 and 200");
  }
  return { status, limit };
}

export function readTaskAddOptions(args: ParsedArgs, command: string) {
  const title = requireOption(args, "title", command);
  const description = readOption(args.options, "description")?.trim() || undefined;
  const deadline = readOption(args.options, "deadline");
  if (deadline && !DATE_PATTERN.test(deadline)) {
    throw new Error("--deadline must use YYYY-MM-DD format");
  }

  const rawPriority = readOption(args.options, "priority")?.trim();
  if (
    rawPriority !== undefined &&
    !TASK_PRIORITIES.includes(rawPriority as (typeof TASK_PRIORITIES)[number])
  ) {
    throw new Error("--priority must be one of: p1, p2, p3");
  }
  const priority: (typeof TASK_PRIORITIES)[number] | undefined =
    rawPriority === "p1" || rawPriority === "p2" || rawPriority === "p3"
      ? rawPriority
      : undefined;

  const rawEstimatedMinutes = readOption(args.options, "estimated-minutes")?.trim();
  let estimatedMinutes: number | undefined;
  if (rawEstimatedMinutes !== undefined) {
    estimatedMinutes = Number(rawEstimatedMinutes);
    if (!Number.isInteger(estimatedMinutes) || estimatedMinutes <= 0) {
      throw new Error("--estimated-minutes must be a positive integer");
    }
  }

  const rawTags = readOption(args.options, "tags");
  let tags: string[] | undefined;
  if (rawTags !== undefined) {
    tags = rawTags
      .split(",")
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    if (tags.length === 0) {
      throw new Error("--tags must include at least one non-empty tag");
    }
    if (tags.length > 20) {
      throw new Error("--tags must contain at most 20 tags");
    }
    const tooLong = tags.find((tag) => tag.length > 50);
    if (tooLong) {
      throw new Error("--tags entries must be 50 characters or fewer");
    }
  }

  return {
    title,
    description,
    deadline,
    priority,
    estimatedMinutes,
    tags,
  };
}

export function executeDryRun(command: string, args: ParsedArgs) {
  if (!hasFlag(args.options, "dry-run")) {
    return null;
  }

  const metadata = getWriteMetadata(args);
  switch (command) {
    case "goals update": {
      const goalPatch = readGoalUpdateOptions(args);
      return {
        action: "goals.update",
        goal: { id: requireOption(args, "goal-id", command) },
        ...goalPatch,
        ...metadata,
        source: "dry-run",
      };
    }
    case "tasks add":
      {
        const task = readTaskAddOptions(args, command);
      return {
        action: "tasks.add",
        ...task,
        createdTaskId: null,
        ...metadata,
        source: "dry-run",
      };
      }
    case "tasks move":
      return {
        action: "tasks.move",
        task: { id: requireOption(args, "task-id", command) },
        targetDate: requireOption(args, "target-date", command),
        ...metadata,
        source: "dry-run",
      };
    case "tasks complete":
      return {
        action: "tasks.complete",
        task: { id: requireOption(args, "task-id", command) },
        ...metadata,
        source: "dry-run",
      };
    case "tasks reopen":
      return {
        action: "tasks.reopen",
        task: { id: requireOption(args, "task-id", command) },
        ...metadata,
        source: "dry-run",
      };
    case "tasks unschedule":
      return {
        action: "tasks.unschedule",
        task: { id: requireOption(args, "task-id", command) },
        ...metadata,
        source: "dry-run",
      };
    default:
      return null;
  }
}
