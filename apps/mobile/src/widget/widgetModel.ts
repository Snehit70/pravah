import type { AccentColor, ThemePreference } from "../lib/userPreferences";

/**
 * Home-screen widget data model.
 *
 * The app writes a compact {@link WidgetSnapshot} after every live sync. The
 * widget never talks to the network to render: it re-buckets this snapshot
 * against the current clock, so it renders instantly, works offline, and rolls
 * over at midnight without the app running.
 *
 * Everything here is pure so it can be unit tested without the native module.
 */

export const WIDGET_SNAPSHOT_VERSION = 1;
/** After this long without a sync the widget shows the amber "stale" footer. */
export const WIDGET_STALE_AFTER_MS = 3 * 60 * 60 * 1000;
/** Snapshot keeps open tasks up to this many days ahead so rollover has data. */
export const WIDGET_LOOKAHEAD_DAYS = 2;
const MAX_SNAPSHOT_TASKS = 80;
const MAX_TITLE_LENGTH = 160;
/** A rejected-write notice stays on the widget for this long. */
export const WIDGET_NOTICE_TTL_MS = 30 * 60 * 1000;

export type WidgetPriority = "p1" | "p2" | "p3";

export type WidgetTask = {
  id: string;
  title: string;
  /** ISO date (YYYY-MM-DD). Inbox tasks never enter the snapshot. */
  deadline: string;
  /** "HH:MM" 24-hour, only for timed tasks. */
  time?: string;
  priority?: WidgetPriority;
  /** Set when the task was completed; only today's completions are kept. */
  completedAt?: number;
};

export type WidgetSnapshot = {
  version: typeof WIDGET_SNAPSHOT_VERSION;
  capturedAt: number;
  accent: AccentColor;
  theme: ThemePreference;
  inboxCount: number;
  tasks: WidgetTask[];
};

/** A completion made from the widget that the server has not confirmed yet. */
export type WidgetPendingCompletion = {
  taskId: string;
  title: string;
  at: number;
};

export type WidgetNotice = {
  message: string;
  at: number;
};

type SourceTask = {
  _id: string;
  title: string;
  deadline?: string;
  time?: string;
  priority?: WidgetPriority;
  completedAt?: number;
  cancelledAt?: number;
};

// ── Dates ────────────────────────────────────────────────────────────────

export function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfLocalDay(date: Date): number {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "Sun 22 Nov" */
export function headerDateLabel(now: Date): string {
  return `${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

/** Overdue rows show when they were due: weekday inside a week, else "12 Nov". */
export function overdueLabel(deadline: string, now: Date): string {
  const due = parseIsoDate(deadline);
  if (!due) return "Late";
  const days = Math.round((startOfLocalDay(now) - due.getTime()) / 86_400_000);
  if (days <= 1) return "Yday";
  if (days < 7) return WEEKDAYS[due.getDay()];
  return `${due.getDate()} ${MONTHS[due.getMonth()]}`;
}

export function syncedAgoLabel(capturedAt: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - capturedAt) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── Snapshot building (app side) ─────────────────────────────────────────

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && parseIsoDate(value) !== null;
}

function isPriority(value: unknown): value is WidgetPriority {
  return value === "p1" || value === "p2" || value === "p3";
}

function toWidgetTask(task: SourceTask): WidgetTask | null {
  if (!task.deadline || !isIsoDate(task.deadline)) return null;
  const title = task.title.trim().slice(0, MAX_TITLE_LENGTH);
  if (!title) return null;
  return {
    id: String(task._id),
    title,
    deadline: task.deadline,
    ...(task.time && /^\d{2}:\d{2}$/.test(task.time) ? { time: task.time } : {}),
    ...(isPriority(task.priority) ? { priority: task.priority } : {}),
    ...(typeof task.completedAt === "number" ? { completedAt: task.completedAt } : {}),
  };
}

/**
 * Builds the snapshot the widget renders from.
 *
 * `completedTasks` only covers today when the Timeline tab is open, so
 * today's completions from the previous snapshot are carried forward unless
 * the task shows up open again (it was reopened).
 */
export function buildWidgetSnapshot(input: {
  now: Date;
  accent: AccentColor;
  theme: ThemePreference;
  inboxCount: number;
  scheduledTasks: readonly SourceTask[];
  completedTasks: readonly SourceTask[];
  previous?: WidgetSnapshot | null;
}): WidgetSnapshot {
  const horizon = localIsoDate(shiftDays(input.now, WIDGET_LOOKAHEAD_DAYS));
  const dayStart = startOfLocalDay(input.now);

  const open: WidgetTask[] = [];
  const openIds = new Set<string>();
  for (const source of input.scheduledTasks) {
    if (source.completedAt !== undefined || source.cancelledAt !== undefined) continue;
    const task = toWidgetTask(source);
    if (!task || task.deadline > horizon) continue;
    open.push(task);
    openIds.add(task.id);
  }

  const done = new Map<string, WidgetTask>();
  for (const source of input.completedTasks) {
    if (typeof source.completedAt !== "number" || source.completedAt < dayStart) continue;
    if (source.cancelledAt !== undefined) continue;
    const task = toWidgetTask(source);
    if (task) done.set(task.id, task);
  }
  for (const task of input.previous?.tasks ?? []) {
    if (task.completedAt === undefined || task.completedAt < dayStart) continue;
    if (openIds.has(task.id) || done.has(task.id)) continue;
    done.set(task.id, task);
  }

  const tasks = [...sortOpen(open), ...done.values()].slice(0, MAX_SNAPSHOT_TASKS);
  return {
    version: WIDGET_SNAPSHOT_VERSION,
    capturedAt: input.now.getTime(),
    accent: input.accent,
    theme: input.theme,
    inboxCount: Math.max(0, Math.floor(input.inboxCount)),
    tasks,
  };
}

/** Marks a task done inside an existing snapshot (widget-side confirmation). */
export function markSnapshotTaskDone(
  snapshot: WidgetSnapshot,
  taskId: string,
  at: number,
): WidgetSnapshot {
  return {
    ...snapshot,
    tasks: snapshot.tasks.map((task) =>
      task.id === taskId && task.completedAt === undefined ? { ...task, completedAt: at } : task,
    ),
  };
}

// ── Parsing (storage is untrusted: older versions, partial writes) ──────

const ACCENTS: readonly AccentColor[] = ["purple", "copper", "teal", "rose"];
const THEMES: readonly ThemePreference[] = ["system", "light", "dark"];

export function parseWidgetSnapshot(raw: string | null | undefined): WidgetSnapshot | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WidgetSnapshot> | null;
    if (!value || value.version !== WIDGET_SNAPSHOT_VERSION) return null;
    if (typeof value.capturedAt !== "number" || !Array.isArray(value.tasks)) return null;
    const tasks: WidgetTask[] = [];
    for (const entry of value.tasks) {
      if (!entry || typeof entry !== "object") continue;
      const task = entry as Partial<WidgetTask>;
      if (typeof task.id !== "string" || typeof task.title !== "string") continue;
      const normalized = toWidgetTask({
        _id: task.id,
        title: task.title,
        deadline: task.deadline,
        time: task.time,
        priority: task.priority,
        completedAt: task.completedAt,
      });
      if (normalized) tasks.push(normalized);
    }
    return {
      version: WIDGET_SNAPSHOT_VERSION,
      capturedAt: value.capturedAt,
      accent: ACCENTS.includes(value.accent as AccentColor) ? (value.accent as AccentColor) : "purple",
      theme: THEMES.includes(value.theme as ThemePreference) ? (value.theme as ThemePreference) : "system",
      inboxCount: typeof value.inboxCount === "number" && value.inboxCount > 0 ? Math.floor(value.inboxCount) : 0,
      tasks,
    };
  } catch {
    return null;
  }
}

export function parsePendingCompletions(raw: string | null | undefined): WidgetPendingCompletion[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter(
      (entry): entry is WidgetPendingCompletion =>
        Boolean(entry) &&
        typeof entry.taskId === "string" &&
        typeof entry.title === "string" &&
        typeof entry.at === "number",
    );
  } catch {
    return [];
  }
}

export function parseNotice(raw: string | null | undefined): WidgetNotice | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<WidgetNotice> | null;
    if (!value || typeof value.message !== "string" || typeof value.at !== "number") return null;
    return { message: value.message, at: value.at };
  } catch {
    return null;
  }
}

// ── View model (widget side) ─────────────────────────────────────────────

export type WidgetRow = {
  id: string;
  title: string;
  /** Right-hand label: "10:00", "—", or an overdue day. */
  meta: string;
  priority?: WidgetPriority;
  overdue: boolean;
  done: boolean;
  /** Ticked from the widget, waiting for the server. */
  saving: boolean;
};

export type WidgetView =
  | { kind: "signedOut" }
  | { kind: "loading"; dateLabel: string }
  | {
      kind: "ready";
      dateLabel: string;
      /** Open overdue rows, oldest first. */
      overdue: WidgetRow[];
      /** Today's open rows: timed by time, then untimed by priority. */
      today: WidgetRow[];
      /** Done today (server or widget), newest last. */
      done: WidgetRow[];
      tomorrow: WidgetRow[];
      /** Rows still to do: overdue + today. */
      remaining: number;
      inboxCount: number;
      nextTimed: WidgetRow | null;
      stale: boolean;
      syncedAgo: string;
      savingCount: number;
      notice: string | null;
    };

const PRIORITY_RANK: Record<WidgetPriority, number> = { p1: 0, p2: 1, p3: 2 };

function priorityRank(priority?: WidgetPriority): number {
  return priority ? PRIORITY_RANK[priority] : 3;
}

function sortOpen(tasks: WidgetTask[]): WidgetTask[] {
  return [...tasks].sort((a, b) => {
    if (a.deadline !== b.deadline) return a.deadline < b.deadline ? -1 : 1;
    if (a.time && b.time && a.time !== b.time) return a.time < b.time ? -1 : 1;
    if (a.time && !b.time) return -1;
    if (!a.time && b.time) return 1;
    const rank = priorityRank(a.priority) - priorityRank(b.priority);
    if (rank !== 0) return rank;
    return a.title.localeCompare(b.title);
  });
}

export function buildWidgetView(input: {
  snapshot: WidgetSnapshot | null;
  signedIn: boolean;
  pending: readonly WidgetPendingCompletion[];
  notice: WidgetNotice | null;
  now: Date;
}): WidgetView {
  if (!input.signedIn) return { kind: "signedOut" };
  const dateLabel = headerDateLabel(input.now);
  const snapshot = input.snapshot;
  if (!snapshot) return { kind: "loading", dateLabel };

  const today = localIsoDate(input.now);
  const tomorrow = localIsoDate(shiftDays(input.now, 1));
  const dayStart = startOfLocalDay(input.now);
  const nowMs = input.now.getTime();
  const pendingIds = new Set(input.pending.map((entry) => entry.taskId));

  const overdue: WidgetRow[] = [];
  const todayRows: WidgetRow[] = [];
  const done: WidgetRow[] = [];
  const tomorrowRows: WidgetRow[] = [];

  const open = sortOpen(snapshot.tasks.filter((task) => task.completedAt === undefined));
  const completed = snapshot.tasks
    .filter((task) => task.completedAt !== undefined && task.completedAt >= dayStart)
    .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0));

  for (const task of open) {
    const saving = pendingIds.has(task.id);
    const isOverdue = task.deadline < today;
    const row: WidgetRow = {
      id: task.id,
      title: task.title,
      meta: isOverdue ? overdueLabel(task.deadline, input.now) : task.time ?? "—",
      priority: task.priority,
      overdue: isOverdue,
      done: saving,
      saving,
    };
    if (saving) {
      if (task.deadline <= today) done.push(row);
      continue;
    }
    if (isOverdue) overdue.push(row);
    else if (task.deadline === today) todayRows.push(row);
    else if (task.deadline === tomorrow) tomorrowRows.push(row);
  }
  for (const task of completed) {
    done.push({
      id: task.id,
      title: task.title,
      meta: task.time ?? "—",
      priority: task.priority,
      overdue: false,
      done: true,
      saving: false,
    });
  }

  const nowHm = `${`${input.now.getHours()}`.padStart(2, "0")}:${`${input.now.getMinutes()}`.padStart(2, "0")}`;
  const nextTimed =
    todayRows.find((row) => row.meta !== "—" && row.meta >= nowHm) ??
    todayRows[0] ??
    overdue[0] ??
    null;

  const notice =
    input.notice && nowMs - input.notice.at < WIDGET_NOTICE_TTL_MS ? input.notice.message : null;

  return {
    kind: "ready",
    dateLabel,
    overdue,
    today: todayRows,
    done,
    tomorrow: tomorrowRows,
    remaining: overdue.length + todayRows.length,
    inboxCount: snapshot.inboxCount,
    nextTimed,
    stale: nowMs - snapshot.capturedAt > WIDGET_STALE_AFTER_MS,
    syncedAgo: syncedAgoLabel(snapshot.capturedAt, nowMs),
    savingCount: input.pending.length,
    notice,
  };
}

/** Rows a list-style widget shows, in display order: overdue, then today. */
export function attentionRows(view: Extract<WidgetView, { kind: "ready" }>): WidgetRow[] {
  return [...view.overdue, ...view.today];
}

/** How many task rows fit in a widget of the given height (dp). */
export function rowsThatFit(heightDp: number, reservedDp: number, rowDp: number): number {
  return Math.max(1, Math.floor((heightDp - reservedDp) / rowDp));
}

/** A widget tick older than this that still can't reach the server is dropped with a notice. */
export const WIDGET_PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type CompletionFailure = "retry" | "auth" | "rejected";

/**
 * Sorts a failed completeTask call. Only answers the server gives for good
 * (task gone or cancelled, signed out) drop the tick; anything else, such as a
 * network blip or a Convex 5xx, keeps it pending for another try.
 */
export function classifyCompletionFailure(error: unknown): CompletionFailure {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status?: unknown }).status)
      : NaN;
  const text = message.toLowerCase();
  if (status === 401 || status === 403 || text.includes("not authenticated") || text.includes("unauthenticated")) {
    return "auth";
  }
  if (text.includes("task not found") || text.includes("task is cancelled")) return "rejected";
  return "retry";
}
