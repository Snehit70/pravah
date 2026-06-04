/// <reference types="node" />
import { randomUUID } from "node:crypto";
import { hasFlag, readOption } from "./args";
import type { ParsedArgs } from "./types";

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
