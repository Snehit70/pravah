#!/usr/bin/env bun
/// <reference types="node" />
import { parseArgs } from "./args";
import { executeCommand, isCliTextResult, resolveCommand } from "./commands";
import { emitError, emitSuccess } from "./envelope";
import { toCliError } from "./errors";
import { renderHumanResult } from "./renderer";

function assertBunRuntime() {
  if (!("Bun" in globalThis)) {
    process.stderr.write("pravah CLI requires bun. Install bun and run this command with `bun`.\n");
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const json = args.options.json === true;
  let command = "help";

  try {
    command = args.positionals[0] === "help" ? "help" : args.positionals.length ? resolveCommand(args) : "help";
    const data = await executeCommand({ command, json }, args);
    if (isCliTextResult(data)) {
      process.stdout.write(`${data.text}\n`);
      process.exit(0);
    }
    const doctorFailed = command === "doctor" && (data as { healthy?: boolean }).healthy === false;
    if (json) emitSuccess(command, data, doctorFailed ? 1 : 0);
    const color = Boolean(process.stdout.isTTY && !process.env.NO_COLOR && args.options["no-color"] !== true);
    process.stdout.write(`${renderHumanResult(command, data, args.options.long === true, color)}\n`);
    process.exit(doctorFailed ? 1 : 0);
  } catch (error: unknown) {
    emitError(command, toCliError(error), json, args.options.debug === true);
  }
}

assertBunRuntime();
await main();
