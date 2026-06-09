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
  return {
    code: "command_failed",
    message: error instanceof Error ? error.message : "Unknown error",
  };
}
