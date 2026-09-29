import type { WatchSnapshot, WatchTask } from "./watchSnapshot";

export interface WaybarSegment {
  text: string;
  tooltip: string;
  class: string;
}

const ICON = "󰃭";
const MUTED_HEX = "#b8b8b8";
const ACCENT_HEX = "#f1c27d";

const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Wide East Asian characters occupy two terminal cells; good enough for truncating titles. */
const WIDE_RE =
  /[\u1100-\u115F\u2329\u232A\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u;

function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    if (/\p{Mark}/u.test(ch)) continue;
    width += WIDE_RE.test(ch) ? 2 : 1;
  }
  return width;
}

function truncate(text: string, width: number): string {
  const collapsed = text.split(/\s+/).join(" ");
  if (displayWidth(collapsed) <= width) return collapsed;
  let used = 0;
  let out = "";
  for (const ch of collapsed) {
    const w = WIDE_RE.test(ch) ? 2 : 1;
    if (used + w + 1 > width) break;
    out += ch;
    used += w;
  }
  return `${out}…`;
}

function pangoEscape(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

/** `09:05:00` renders as `9:05`; anything else passes through untouched. */
function formatClock(time: string | undefined): string {
  if (!time) return "";
  const raw = time.trim();
  const match = /^(\d{2}):(\d{2})/.exec(raw);
  if (match) return `${Number.parseInt(match[1], 10)}:${match[2]}`;
  return raw;
}

function formatDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = Number.parseInt(match[2], 10);
  if (month < 1 || month > 12) return iso;
  return `${Number.parseInt(match[3], 10)} ${MONTHS[month - 1]}`;
}

const activeTask = (task: WatchTask): boolean =>
  task.status === "inbox" || task.status === "timeline";

const rankPriority = (task: WatchTask): number =>
  PRIORITY_RANK[task.priority ?? "p3"] ?? PRIORITY_RANK.p3;

/**
 * The same "today" the `today` command reports: active work due on the
 * snapshot's local day, ordered by due time, then priority, then title.
 */
function todayTasks(snapshot: WatchSnapshot): WatchTask[] {
  return snapshot.tasks
    .filter((task) => activeTask(task) && task.deadline === snapshot.day)
    .sort(
      (a, b) =>
        `${a.deadline ?? "9999"}${a.time ?? "99:99"}`.localeCompare(
          `${b.deadline ?? "9999"}${b.time ?? "99:99"}`
        ) ||
        rankPriority(a) - rankPriority(b) ||
        a.title.localeCompare(b.title)
    );
}

const taskName = (task: WatchTask): string =>
  task.title.replace(/\s+/g, " ").trim() || "Untitled";

/**
 * waybar reads one JSON object per line from a script module. The segment keeps
 * the historical desktop shape — icon, remaining count, and the next task —
 * so existing `#custom-pravah` styles (`has-tasks`, `clear`, `error`) apply.
 */
export function formatWaybarSegment(snapshot: WatchSnapshot): WaybarSegment {
  const tasks = todayTasks(snapshot);
  const count = tasks.length;
  const failed = snapshot.errors?.filter((error) => error.length > 0) ?? [];

  if (count === 0) {
    const tooltip =
      failed.length > 0
        ? `Nothing left today\n\nLast refresh failed: ${failed.join("; ")}`
        : "Nothing left today";
    return {
      text: ICON,
      tooltip,
      class: failed.length > 0 ? "error" : "clear",
    };
  }

  const next = tasks.find((task) => formatClock(task.time)) ?? tasks[0];
  let title = pangoEscape(truncate(taskName(next), 20));
  if (next.priority === "p1") {
    title = `<span foreground='${ACCENT_HEX}'>${title}</span>`;
  }
  const countHtml = `<span foreground='${MUTED_HEX}'>${count}</span>`;
  let text = `${ICON} ${countHtml}  ${title}`;
  const clock = formatClock(next.time);
  if (clock) {
    text += `  <span foreground='${MUTED_HEX}'>${pangoEscape(clock)}</span>`;
  }

  const timeWidth = Math.max(
    ...tasks.map((task) => displayWidth(formatClock(task.time))),
    0
  );
  let heading = `Today · ${count} left`;
  if (snapshot.day) heading += `  ·  ${formatDay(snapshot.day)}`;
  const lines = [heading];
  for (const task of tasks) {
    const padded = formatClock(task.time).padStart(timeWidth);
    lines.push(timeWidth > 0 ? `${padded}  ${taskName(task)}` : taskName(task));
  }
  if (failed.length > 0) {
    lines.push("");
    lines.push(`Last refresh failed: ${failed.join("; ")}`);
  }

  return {
    text,
    tooltip: lines.join("\n"),
    class: failed.length > 0 ? "error" : "has-tasks",
  };
}
