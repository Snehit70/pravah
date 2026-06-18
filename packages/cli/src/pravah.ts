#!/usr/bin/env bun
/// <reference types="node" />
import { parseArgs } from "./args";
import { executeCommand } from "./commands";
import { emitError, emitSuccess } from "./envelope";
import { toCliError } from "./errors";

function assertBunRuntime() {
  if (!("Bun" in globalThis)) {
    process.stderr.write("pravah CLI requires bun. Install bun and run this command with `bun`.\n");
    process.exit(1);
  }
}

function printHelp() {
  process.stdout.write(`pravah CLI

Usage:
  pravah <namespace> <command> [options] [--json]

Examples:
  pravah auth import --bootstrap-token pravah_bootstrap_xxx --json
  pravah auth whoami --json
  pravah capabilities --json
  pravah goals list --json
  pravah goals search --query "mobile beta" --json
  pravah goals create --text "Ship mobile beta" --deadline 2026-07-01 --json
  pravah goals update --goal-id <id> --description "My goal description" --deadline clear --json
  pravah goals delete --goal-id <id> --confirm-goal-delete --json
  pravah tasks list --status timeline --json
  pravah tasks search --query "brief" --status timeline --json
  pravah tasks add --title "Draft CLI contract" --deadline 2026-06-05 --priority p2 --estimated-minutes 30 --tags cli,automation --dry-run --json
  pravah tasks update --task-id <id> --priority p1 --estimated-minutes clear --tags shipping,docs --json
  pravah tasks delete --task-id <id> --confirm-task-delete --json
  pravah tasks link-goal --task-id <id> --goal-id <goal-id> --json
  pravah operations list --limit 20 --json
  pravah operations undo --operation-id <operation-id> --json
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

  if (!action && namespace !== "capabilities") {
    emitError(
      namespace,
      {
        code: "invalid_command",
        message: "Missing command name",
      },
      json
    );
  }

  const command = action ? `${namespace} ${action}` : namespace;

  try {
    const data = await executeCommand({ command, json }, args);
    emitSuccess(command, data);
  } catch (error: unknown) {
    emitError(command, toCliError(error), json);
  }
}

assertBunRuntime();
await main();
