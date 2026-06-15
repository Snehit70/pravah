#!/usr/bin/env bun
/// <reference types="node" />
import { parseArgs } from "./args";
import { executeCommand } from "./commands";
import { emitError, emitSuccess } from "./envelope";
import { toCliError } from "./errors";

function printHelp() {
  process.stdout.write(`pravah CLI

Usage:
  pravah <namespace> <command> [options] [--json]

Examples:
  pravah auth import --bootstrap-token pravah_bootstrap_xxx --json
  pravah auth whoami --json
  pravah goals list --json
  pravah goals update --goal-id <id> --description "My goal description" --deadline clear --json
  pravah tasks list --status timeline --json
  pravah tasks add --title "Draft CLI contract" --deadline 2026-06-05 --priority p2 --estimated-minutes 30 --tags cli,automation --dry-run --json
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
    emitError(command, toCliError(error), json);
  }
}

await main();
