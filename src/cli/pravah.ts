#!/usr/bin/env bun
/// <reference types="node" />
import { parseArgs } from "./args";
import { executeCommand } from "./commands";
import { emitError, emitSuccess } from "./envelope";

function printHelp() {
  process.stdout.write(`pravah mock CLI

Usage:
  pravah <namespace> <command> [options] [--json]

Examples:
  pravah tasks list --status scheduled --json
  pravah tasks add --title "Draft CLI contract" --scheduled-date 2026-06-05 --dry-run --json
  pravah agent context --json
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [namespace, action] = args.positionals;
  const json = args.options.json === true;

  if (!namespace || args.options.help === true || args.options.h === true) {
    printHelp();
    process.exit(0);
  }

  if (!action) {
    emitError(
      namespace,
      {
        code: "invalid_command",
        message: "Missing command name",
      },
      json
    );
  }

  const command = `${namespace} ${action}`;

  try {
    const data = await executeCommand({ command, json }, args);
    emitSuccess(command, data);
  } catch (error: unknown) {
    emitError(
      command,
      {
        code: "command_failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      json
    );
  }
}

await main();
