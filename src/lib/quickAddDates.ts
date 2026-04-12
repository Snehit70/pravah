export function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTomorrowDateString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toLocalDateString(tomorrow);
}

export function getNextMondayDateString(): string {
  const nextMonday = new Date();
  const day = nextMonday.getDay();
  const delta = ((8 - day) % 7) || 7;
  nextMonday.setDate(nextMonday.getDate() + delta);
  return toLocalDateString(nextMonday);
}
