import type { CliError } from "./types";

export class CliCommandError extends Error {
  readonly code: string;
  readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    details?: unknown
  ) {
    super(message);
    this.name = "CliCommandError";
    this.code = code;
    this.details = details;
  }
}

export function toCliError(error: unknown): CliError {
  if (error instanceof CliCommandError) {
    return {
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  return {
    code: classifyErrorMessage(message),
    message,
  };
}

function classifyErrorMessage(message: string): string {
  if (
    message.startsWith("Unknown command:") ||
    message.startsWith("Unexpected positional arguments") ||
    message === "Missing command name"
  ) {
    return "invalid_command";
  }
  if (
    message.startsWith("Unknown option --") ||
    message.includes(" requires a value") ||
    message.includes(" does not accept a value") ||
    message.includes("Provide exactly one of") ||
    message.includes("must be between 1 and 200 characters")
  ) {
    return "invalid_option";
  }
  if (
    message.includes("not authenticated") ||
    message.includes("Stored credential file is invalid") ||
    message.includes("Credential import payload is invalid") ||
    message.includes("Bootstrap exchange response is invalid") ||
    message.includes("Unauthorized")
  ) {
    return "unauthenticated";
  }
  if (message.includes("missing required scopes") || message.includes("Forbidden")) {
    return "forbidden";
  }
  if (message.includes("not found") || message.includes("Not found")) {
    return "not_found";
  }
  if (
    message.includes("Idempotency") ||
    message.includes("conflict") ||
    message.includes("already")
  ) {
    return "conflict";
  }
  if (
    message.includes("fetch failed") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND") ||
    message.includes("network")
  ) {
    return "network_failed";
  }
  if (message.includes("server") || message.includes("Server")) {
    return "server_error";
  }
  return "validation_failed";
}
