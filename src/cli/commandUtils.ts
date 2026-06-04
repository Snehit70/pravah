/// <reference types="node" />
import { randomUUID } from "node:crypto";
import { hasFlag, readOption } from "./args";
import type { ParsedArgs } from "./types";

const TASK_STATUSES = ["inbox", "scheduled", "completed", "cancelled"] as const;
const REVIEW_STATUSES = ["pending", "approved", "rejected"] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function requireOption(
  args: ParsedArgs,
  key: string,
  command: string
): string {
  const value = readOption(args.options, key);
  if (!value) {
    throw new Error(`Missing required option --${key} for ${command}`);
  }
  return value;
}

export function getWriteMetadata(args: ParsedArgs) {
  return {
    dryRun: hasFlag(args.options, "dry-run"),
    idempotencyKey:
      readOption(args.options, "idempotency-key") ?? `cli_${randomUUID()}`,
  };
}

export function readTaskListFilters(args: ParsedArgs) {
  const status = readOption(args.options, "status");
  const date = readOption(args.options, "date");
  if (status && !TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
    throw new Error(`--status must be one of: ${TASK_STATUSES.join(", ")}`);
  }
  if (date && !DATE_PATTERN.test(date)) {
    throw new Error("--date must use YYYY-MM-DD format");
  }
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

export function executeDryRun(command: string, args: ParsedArgs) {
  if (!hasFlag(args.options, "dry-run")) {
    return null;
  }

  const metadata = getWriteMetadata(args);
  switch (command) {
    case "tasks add":
      return {
        action: "tasks.add",
        title: requireOption(args, "title", command),
        scheduledDate: readOption(args.options, "scheduled-date"),
        description: readOption(args.options, "description"),
        createdTaskId: null,
        ...metadata,
        source: "dry-run",
      };
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
