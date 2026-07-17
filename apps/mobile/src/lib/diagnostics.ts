import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, type AppStateStatus, type NativeEventSubscription } from "react-native";

export type DiagnosticLevel = "debug" | "info" | "warn" | "error";
export type DiagnosticFlow =
  | "auth"
  | "sync"
  | "ui"
  | "network"
  | "app_lifecycle"
  | "health"
  | "unknown";

export type DiagnosticEvent = {
  ts: number;
  sessionId: string;
  seq: number;
  event: string;
  level: DiagnosticLevel;
  screen: string;
  flow: DiagnosticFlow;
  meta?: Record<string, unknown>;
};

const STORAGE_KEY = "pravah_diagnostics_v1";
const MAX_EVENTS = 10_000;
const MAX_BYTES = 20 * 1024 * 1024;
const MAX_AGE_MS = 36 * 60 * 60 * 1000;
const FLUSH_INTERVAL_MS = 5_000;
const MAX_SESSIONS = 3;

const REDACTED = "[REDACTED]";
const TRUNCATE_AT = 160;
const REDACT_KEYS = new Set([
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "email",
  "phone",
  "message",
  "description",
  "notes",
  "title",
]);

type PersistedPayload = {
  sessions: {
    sessionId: string;
    startedAt: number;
    events: DiagnosticEvent[];
  }[];
};

const sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seq = 0;
let currentScreen = "unknown";
const buffer: DiagnosticEvent[] = [];
let priorSessions: PersistedPayload["sessions"] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let appStateSubscription: NativeEventSubscription | null = null;
let isInitialized = false;
let initializationPromise: Promise<void> | null = null;
let isFlushing = false;

function inferFlow(event: string): DiagnosticFlow {
  const key = event.toLowerCase();
  if (key.includes("login") || key.includes("signin") || key.includes("auth")) return "auth";
  if (key.includes("queue") || key.includes("mutation") || key.includes("bootstrap")) return "sync";
  if (key.includes("press") || key.includes("modal") || key.includes("tab")) return "ui";
  if (key.includes("network") || key.includes("request") || key.includes("fetch")) return "network";
  if (key.includes("app_") || key.includes("foreground") || key.includes("background")) {
    return "app_lifecycle";
  }
  if (key.includes("lag") || key.includes("jank") || key.includes("freeze") || key.includes("interactive")) {
    return "health";
  }
  return "unknown";
}

function sanitizeValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === "string") {
    return value.length > TRUNCATE_AT ? `${value.slice(0, TRUNCATE_AT)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(sanitizeValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEYS.has(k) ? REDACTED : sanitizeValue(v);
    }
    return out;
  }
  return String(value);
}

function approxBytes(events: DiagnosticEvent[]): number {
  try {
    return events.reduce((sum, item) => sum + JSON.stringify(item).length, 0);
  } catch {
    return MAX_BYTES + 1;
  }
}

function pruneEvents(events: DiagnosticEvent[]): DiagnosticEvent[] {
  const cutoff = Date.now() - MAX_AGE_MS;
  const fresh = events.filter((event) => event.ts >= cutoff);
  if (fresh.length <= MAX_EVENTS && approxBytes(fresh) <= MAX_BYTES) return fresh;
  const mutable = [...fresh];
  while (mutable.length > MAX_EVENTS || approxBytes(mutable) > MAX_BYTES) {
    mutable.shift();
  }
  return mutable;
}

async function loadPersisted(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as PersistedPayload;
    if (!parsed || !Array.isArray(parsed.sessions)) return;
    priorSessions = parsed.sessions.slice(-MAX_SESSIONS).map((session) => ({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      events: pruneEvents(session.events ?? []),
    }));
  } catch {
    priorSessions = [];
  }
}

async function flushNow(reason: string): Promise<void> {
  if (isFlushing) return;
  isFlushing = true;
  try {
    const current = {
      sessionId,
      startedAt: Number(sessionId.split("-")[1] ?? Date.now()),
      events: pruneEvents(buffer),
    };
    const sessions = [...priorSessions.filter((s) => s.sessionId !== sessionId), current]
      .slice(-MAX_SESSIONS)
      .map((s) => ({ ...s, events: pruneEvents(s.events) }));
    priorSessions = sessions;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ sessions }));
    void reason;
  } finally {
    isFlushing = false;
  }
}

function handleAppStateChange(nextState: AppStateStatus): void {
  recordDiagnosticEvent("app_state_changed", "info", {
    appState: nextState,
  });
  if (nextState !== "active") {
    void flushNow("background");
  }
}

export async function initializeDiagnostics(): Promise<void> {
  if (initializationPromise) return initializationPromise;
  isInitialized = true;
  initializationPromise = (async () => {
    await loadPersisted();
    recordDiagnosticEvent("app_session_started", "info", { restoredSessions: priorSessions.length });
    appStateSubscription = AppState.addEventListener("change", handleAppStateChange);
    flushTimer = setInterval(() => {
      void flushNow("interval");
    }, FLUSH_INTERVAL_MS);
  })();
  return initializationPromise;
}

export async function shutdownDiagnostics(): Promise<void> {
  // Before init, priorSessions is empty; flushing would clobber persisted
  // history with only the current in-memory buffer.
  if (!isInitialized) return;
  await initializationPromise;
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  appStateSubscription?.remove();
  appStateSubscription = null;
  await flushNow("shutdown");
}

export function setDiagnosticScreen(nextScreen: string): void {
  currentScreen = nextScreen || "unknown";
}

export function recordDiagnosticEvent(
  event: string,
  level: DiagnosticLevel,
  meta?: Record<string, unknown>,
  flow?: DiagnosticFlow
): void {
  seq += 1;
  const item: DiagnosticEvent = {
    ts: Date.now(),
    sessionId,
    seq,
    event,
    level,
    screen: currentScreen,
    flow: flow ?? inferFlow(event),
    meta: meta ? (sanitizeValue(meta) as Record<string, unknown>) : undefined,
  };
  buffer.push(item);
  if (buffer.length > MAX_EVENTS) {
    buffer.shift();
  }
}

export async function getDiagnosticsSnapshot(): Promise<DiagnosticEvent[]> {
  await loadPersisted();
  const merged = priorSessions
    .filter((session) => session.sessionId !== sessionId)
    .flatMap((session) => session.events)
    .concat(buffer);
  return pruneEvents(merged);
}

export function getDiagnosticsRuntimeState(): {
  sessionId: string;
  currentScreen: string;
  inMemoryCount: number;
  latestEvent?: Pick<DiagnosticEvent, "event" | "ts" | "level" | "flow" | "screen" | "seq">;
} {
  const latest = buffer[buffer.length - 1];
  return {
    sessionId,
    currentScreen,
    inMemoryCount: buffer.length,
    latestEvent: latest
      ? {
          event: latest.event,
          ts: latest.ts,
          level: latest.level,
          flow: latest.flow,
          screen: latest.screen,
          seq: latest.seq,
        }
      : undefined,
  };
}
