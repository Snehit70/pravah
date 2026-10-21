#!/usr/bin/env bun
/// <reference types="node" />
import { parseArgs } from "./args";
import { executeCommand, isCliTextResult, normalizeCommandPositionals, resolveCommand } from "./commands";
import { createInterface } from "node:readline";
import { emitError, emitSuccess } from "./envelope";
import { toCliError } from "./errors";
import { renderHumanResult } from "./renderer";
import { planWatchCommand, runWatchCommand } from "./watchCommand";
import { validateCommandArgs } from "./commandUtils";
import type { ParsedArgs } from "./types";

const privateInputOptions: Record<string, readonly string[]> = {
  "tasks add": ["description", "tags", "goal"],
  "tasks edit": ["title", "description", "tags", "goal"],
  "goals add": ["description"],
  "goals edit": ["description"],
};

async function readPrivateWriteInput(command: string, args: ParsedArgs): Promise<ParsedArgs> {
  if (args.options["private-input-stdin"] !== true) return args;

  const allowedOptions = privateInputOptions[command];
  if (!allowedOptions) throw new Error(`--private-input-stdin is not supported for ${command}`);

  const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const line = await new Promise<string>((resolve, reject) => {
    let settled = false;
    input.once("line", (value) => {
      settled = true;
      input.close();
      resolve(value);
    });
    input.once("error", (error) => {
      if (settled) return;
      settled = true;
      input.close();
      reject(error);
    });
    input.once("close", () => {
      if (settled) return;
      settled = true;
      reject(new Error("Expected one JSON line on stdin"));
    });
  });

  let payload: unknown;
  try {
    payload = JSON.parse(line);
  } catch {
    throw new Error("Private write input must be valid JSON");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Private write input must be a JSON object");
  }

  const record = payload as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== "target" && key !== "options")) {
    throw new Error("Private write input contains an unsupported field");
  }

  const adding = command === "tasks add" || command === "goals add";
  const nextArgs: ParsedArgs = {
    positionals: [...args.positionals],
    options: { ...args.options },
  };
  if (adding) {
    if (typeof record.target !== "string" || !record.target.trim()) {
      throw new Error("Private write input requires a non-empty target");
    }
    nextArgs.positionals[nextArgs.positionals.length - 1] = record.target;
  } else if (record.target !== undefined) {
    throw new Error("Private write input cannot replace this command target");
  }

  const suppliedOptions = record.options ?? {};
  if (!suppliedOptions || typeof suppliedOptions !== "object" || Array.isArray(suppliedOptions)) {
    throw new Error("Private write options must be a JSON object");
  }
  for (const [key, value] of Object.entries(suppliedOptions)) {
    if (!allowedOptions.includes(key) || typeof value !== "string") {
      throw new Error("Private write input contains an unsupported option");
    }
    nextArgs.options[key] = value;
  }
  return nextArgs;
}

function assertBunRuntime() {
  if (!("Bun" in globalThis)) {
    process.stderr.write("pravah CLI requires bun. Install bun and run this command with `bun`.\n");
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let normalizedArgs = { ...args, positionals: normalizeCommandPositionals(args.positionals) };
  const json = normalizedArgs.options.json === true;
  let command = "help";

  try {
    command = normalizedArgs.options.help === true || normalizedArgs.positionals[0] === "help" ? "help" : normalizedArgs.positionals.length ? resolveCommand(normalizedArgs) : "help";

    if (normalizedArgs.options["private-input-stdin"] === true) {
      validateCommandArgs(command, normalizedArgs);
      normalizedArgs = await readPrivateWriteInput(command, normalizedArgs);
    }

    if (command === "watch") {
      // `watch` streams until interrupted, so it bypasses the one-shot result
      // path below entirely.
      validateCommandArgs("watch", normalizedArgs);
      planWatchCommand(normalizedArgs);
      await runWatchCommand(normalizedArgs);
      return;
    }

    const data = await executeCommand({ command, json }, normalizedArgs);
    if (isCliTextResult(data)) {
      process.stdout.write(`${data.text}\n`);
      process.exit(0);
    }
    const doctorFailed = command === "doctor" && (data as { healthy?: boolean }).healthy === false;
    if (json) emitSuccess(command, data, doctorFailed ? 1 : 0);
    const color = Boolean(process.stdout.isTTY && !process.env.NO_COLOR && normalizedArgs.options["no-color"] !== true);
    process.stdout.write(`${renderHumanResult(command, data, normalizedArgs.options.long === true, color)}\n`);
    process.exit(doctorFailed ? 1 : 0);
  } catch (error: unknown) {
    emitError(command, toCliError(error), json, normalizedArgs.options.debug === true);
  }
}

assertBunRuntime();
await main();
