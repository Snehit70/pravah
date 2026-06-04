/// <reference types="node" />
import { mkdirSync, appendFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CLI_CONTRACT_VERSION, type CliError, type CliErrorEnvelope, type CliSuccessEnvelope } from "./types";

function logAudit(entry: Record<string, unknown>) {
  const path = join(homedir(), ".local", "state", "pravah", "cli-audit.log");
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf8");
}

export function successEnvelope<T>(
  command: string,
  data: T
): CliSuccessEnvelope<T> {
  return {
    ok: true,
    version: CLI_CONTRACT_VERSION,
    command,
    data,
  };
}

export function errorEnvelope(
  command: string,
  error: CliError
): CliErrorEnvelope {
  return {
    ok: false,
    version: CLI_CONTRACT_VERSION,
    command,
    error,
  };
}

export function emitSuccess<T>(command: string, data: T): never {
  const envelope = successEnvelope(command, data);
  logAudit({
    timestamp: new Date().toISOString(),
    command,
    ok: true,
  });
  process.stdout.write(`${JSON.stringify(envelope)}\n`);
  process.exit(0);
  throw new Error("Unreachable");
}

export function emitError(
  command: string,
  error: CliError,
  json = false
): never {
  const envelope = errorEnvelope(command, error);
  logAudit({
    timestamp: new Date().toISOString(),
    command,
    ok: false,
    code: error.code,
  });
  if (json) {
    process.stdout.write(`${JSON.stringify(envelope)}\n`);
  } else {
    process.stderr.write(`pravah: ${error.message}\n`);
  }
  process.exit(1);
  throw new Error("Unreachable");
}
