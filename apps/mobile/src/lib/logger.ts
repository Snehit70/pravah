import { recordDiagnosticEvent, type DiagnosticLevel } from "./diagnostics";

type LogLevel = "debug" | "info" | "warn" | "error";
export type ErrorKind = "network" | "auth" | "validation" | "unexpected" | "unknown";

type LogContext = Record<string, unknown>;

const LOG_PREFIX = "[PRAVAH_MOBILE]";
let actionCounter = 0;

function isDevRuntime(): boolean {
  return typeof __DEV__ === "boolean" ? __DEV__ : process.env.NODE_ENV !== "production";
}

function safeStringify(context?: LogContext): string {
  if (!context) return "";
  try {
    return ` ${JSON.stringify(context)}`;
  } catch {
    return ' {"_serializationError":true}';
  }
}

function writeLog(level: LogLevel, event: string, context?: LogContext): void {
  if (!isDevRuntime() && level === "debug") return;
  recordDiagnosticEvent(event, level as DiagnosticLevel, context);

  const line = `${LOG_PREFIX} ${level.toUpperCase()} ${event}${safeStringify(context)}`;
  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function createActionId(prefix = "act"): string {
  actionCounter += 1;
  return `${prefix}-${Date.now()}-${actionCounter}`;
}

export function classifyError(error: unknown): ErrorKind {
  if (error == null) return "unknown";

  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : NaN;

  const haystack = `${name} ${message} ${code}`.toLowerCase();

  if (
    haystack.includes("network") ||
    haystack.includes("fetch") ||
    haystack.includes("offline") ||
    haystack.includes("timeout") ||
    haystack.includes("internet") ||
    haystack.includes("econn") ||
    haystack.includes("err_network") ||
    haystack.includes("failed to fetch")
  ) {
    return "network";
  }

  if (
    status === 401 ||
    status === 403 ||
    haystack.includes("unauthorized") ||
    haystack.includes("forbidden") ||
    haystack.includes("token")
  ) {
    return "auth";
  }

  if (
    status === 400 ||
    status === 422 ||
    haystack.includes("validation") ||
    haystack.includes("invalid")
  ) {
    return "validation";
  }

  return "unexpected";
}

export function describeErrorForDiagnostics(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      errorStack: error.stack,
    };
  }

  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return {
      errorName: typeof record.name === "string" ? record.name : "NonErrorThrow",
      errorMessage:
        typeof record.message === "string"
          ? record.message
          : "A non-Error object was thrown.",
      errorStack: typeof record.stack === "string" ? record.stack : undefined,
      thrownValueType: "object",
      thrownValueKeys: Object.keys(record).slice(0, 20),
    };
  }

  return {
    errorName: "NonErrorThrow",
    errorMessage: String(error),
    thrownValueType: typeof error,
  };
}

export const mobileLogger = {
  debug: (event: string, context?: LogContext) => writeLog("debug", event, context),
  info: (event: string, context?: LogContext) => writeLog("info", event, context),
  warn: (event: string, context?: LogContext) => writeLog("warn", event, context),
  error: (event: string, context?: LogContext) => writeLog("error", event, context),
};
