/**
 * Pure month-grid math for the themed date picker. Kept dependency-free so the
 * offset/leap-year/padding logic (the bug-prone part) is unit-testable without
 * rendering the calendar.
 */

/**
 * Build a Monday-first month grid: rows of 7 cells, where each cell is the day
 * number or `null` for padding before the 1st / after the last day.
 */
export function buildMonthGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1);
  // getDay() is Sunday=0..Saturday=6; shift so Monday=0..Sunday=6.
  const leadingBlanks = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < leadingBlanks; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth; d += 1) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
  return rows;
}
