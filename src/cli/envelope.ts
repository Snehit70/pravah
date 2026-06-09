/// <reference types="node" />
import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { CLI_CONTRACT_VERSION, type CliError, type CliErrorEnvelope, type CliSuccessEnvelope } from "./types";

export function getCliAuditLogPath() {
  const stateHome =
    process.env.XDG_STATE_HOME ??
    join(process.env.HOME ?? homedir(), ".local", "state");
  return join(stateHome, "pravah", "cli-audit.log");
}

function logAudit(entry: Record<string, unknown>) {
  try {
    const path = getCliAuditLogPath();
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    chmodSync(dirname(path), 0o700);
    appendFileSync(path, `${JSON.stringify(entry)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
    chmodSync(path, 0o600);
  } catch {
    // A local audit write must not hide the result of a completed remote write.
  }
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
