import { colors } from "../theme/tokens";

export type TaskPriority = "p1" | "p2" | "p3" | undefined;

export function formatTime12h(time: string): string {
  const [hStr, mStr] = time.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

export function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseIsoDate(value?: string): Date {
  if (!value) return new Date();
  const [y, m, d] = value.split("-").map((v) => Number(v));
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

export function nextPriority(current: TaskPriority): TaskPriority {
  if (current === undefined) return "p1";
  if (current === "p1") return "p2";
  if (current === "p2") return "p3";
  return undefined;
}

export function priorityDotColor(priority: TaskPriority): string {
  if (priority === "p1") return colors.priorityP1;
  if (priority === "p2") return colors.priorityP2;
  if (priority === "p3") return colors.priorityP3;
  return colors.borderSubtle;
}

export function priorityLabel(priority: TaskPriority): string {
  if (priority === "p1") return "P1";
  if (priority === "p2") return "P2";
  if (priority === "p3") return "P3";
  return "—";
}
