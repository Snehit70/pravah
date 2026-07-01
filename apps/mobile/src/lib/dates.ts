export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getLocalDateString(date: Date = new Date()): string {
  return toIsoDate(date);
}

export function addDays(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
}

export function nextLaterThisWeek(base: Date = new Date()): Date {
  const day = base.getDay();
  const daysUntilFriday = (5 - day + 7) % 7;
  // Once Friday has arrived or passed, anchor to the coming weekend rather
  // than jumping a full week ahead under a misleading "later this week" label.
  // Sunday still needs to stay in the future, so advance to Monday instead of
  // resolving to "today" and duplicating the Today preset.
  const offset = day === 6 ? 1 : day === 0 ? 1 : daysUntilFriday === 0 ? 2 : daysUntilFriday;
  return addDays(base, offset);
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseIsoParts(iso: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/** Canonical app-wide human date, e.g. "Jun 18, 2026". Use this everywhere a
 *  full date is shown — never a raw ISO string. Returns the input unchanged if
 *  it isn't a valid ISO date. */
export function humanDate(iso: string): string {
  const p = parseIsoParts(iso);
  if (!p) return iso;
  const month = SHORT_MONTHS[p.month - 1] ?? String(p.month);
  return `${month} ${p.day}, ${p.year}`;
}

/** Compact human date without the year, e.g. "Jun 18" — for dense chrome like
 *  timeline day headers where the year is implicit in the near-term horizon. */
export function shortDate(iso: string): string {
  const p = parseIsoParts(iso);
  if (!p) return iso;
  const month = SHORT_MONTHS[p.month - 1] ?? String(p.month);
  return `${month} ${p.day}`;
}

function weekdayShort(iso: string): string {
  const p = parseIsoParts(iso);
  if (!p) return "";
  // Local construction (not UTC) so the weekday matches the user's calendar day.
  return SHORT_WEEKDAYS[new Date(p.year, p.month - 1, p.day).getDay()] ?? "";
}

/**
 * Timeline section header label. Today/Tomorrow stay relative; everything from
 * today+2 onward gets a distinct day-named header ("Thu · Jun 18") so days are
 * never indistinguishable. Overdue dates collapse to a single "Overdue" label
 * (the timeline lists them in a triage banner, not inline).
 */
export function dateLabel(date: string, today: string, tomorrow: string): string {
  if (date === today) return "Today";
  if (date === tomorrow) return "Tomorrow";
  if (date < today) return "Overdue";
  const weekday = weekdayShort(date);
  const p = parseIsoParts(date);
  const todayParts = parseIsoParts(today);
  if (weekday && p && todayParts && p.year !== todayParts.year) {
    return `${weekday} · ${humanDate(date)}`;
  }
  return weekday ? `${weekday} · ${shortDate(date)}` : shortDate(date);
}

export function isIsoDate(value: string): boolean {
  return parseIsoParts(value) !== null;
}
