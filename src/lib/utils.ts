import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Get local date string in YYYY-MM-DD format, avoiding UTC timezone bugs */
export function getLocalDateString(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function getLocalDayBounds(date: Date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { dayStartMs: start.getTime(), dayEndMs: end.getTime() };
}

/** Generate array of date strings centered around today */
export function generateDateRange(pastDays: number = 7, futureDays: number = 14): string[] {
  const today = new Date();
  const dates: string[] = [];
  for (let i = -pastDays; i < futureDays; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(getLocalDateString(d));
  }
  return dates;
}

/** Parse a date string into a local Date object (avoids UTC midnight issue) */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/** Format a date string for display */
export function formatDay(dateStr: string): { dayName: string; dayNum: number; monthShort: string } {
  const date = parseLocalDate(dateStr);
  return {
    dayName: date.toLocaleDateString("en-US", { weekday: "short" }),
    dayNum: date.getDate(),
    monthShort: date.toLocaleDateString("en-US", { month: "short" }),
  };
}

/** How many days between two date strings */
export function daysBetween(dateA: string, dateB: string): number {
  const a = parseLocalDate(dateA);
  const b = parseLocalDate(dateB);
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

/** Format a deadline date for display */
export function formatDeadline(deadline: string, today: string = getLocalDateString()): string {
  const diff = daysBetween(today, deadline);
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff <= 7) return `Due in ${diff}d`;
  return `Due ${parseLocalDate(deadline).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

/** Threshold for "due soon" - tasks due within this many days */
export const DUE_SOON_DAYS = 3;
