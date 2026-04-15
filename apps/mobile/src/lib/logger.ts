type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

const LOG_PREFIX = "[PRAVAH_MOBILE]";
let actionCounter = 0;

function safeStringify(context?: LogContext): string {
  if (!context) return "";
  try {
    return ` ${JSON.stringify(context)}`;
  } catch {
    return ' {"_serializationError":true}';
  }
}

function writeLog(level: LogLevel, event: string, context?: LogContext): void {
  if (!__DEV__ && level === "debug") return;

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

export function classifyError(error: unknown): string {
  if (!(error instanceof Error)) return "unknown";

  const msg = error.message.toLowerCase();
  if (
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("offline") ||
    msg.includes("timeout") ||
    msg.includes("internet")
  ) {
    return "network";
  }
  if (msg.includes("unauthorized") || msg.includes("forbidden") || msg.includes("token")) {
    return "auth";
  }
  if (msg.includes("validation") || msg.includes("invalid")) {
    return "validation";
  }

  return "unexpected";
}

export const mobileLogger = {
  debug: (event: string, context?: LogContext) => writeLog("debug", event, context),
  info: (event: string, context?: LogContext) => writeLog("info", event, context),
  warn: (event: string, context?: LogContext) => writeLog("warn", event, context),
  error: (event: string, context?: LogContext) => writeLog("error", event, context),
};
