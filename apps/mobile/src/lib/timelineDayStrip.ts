import { addDays, isoToDate, toIsoDate } from "./dates";
import type { DayCarouselCard } from "./timelineCarousel";

/**
 * Week model for the Timeline day strip (ADR-0009: the strip presents an honest
 * Sunday–Saturday calendar week, not the sparse carousel axis).
 *
 * The carousel axis is sparse — one card per day that has tasks, plus a leading
 * Overdue card. The strip reconciles that with a dense 7-day week: every weekday
 * gets a cell, days that hold a card are reachable destinations, and days
 * without one are shown for orientation but are not tappable. The week is built
 * around the day the user is currently viewing, so it slides to follow the
 * carousel across week boundaries.
 */

const WEEKDAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export type DayStripCell = {
  dateKey: string;
  /** Single-letter weekday header (S M T W T F S), by position in the week. */
  weekdayLetter: string;
  dayOfMonth: number;
  isToday: boolean;
  /** A card exists for this day and it has ≥1 live task — drives the presence
   *  dot. A held Day-clear day has a card but 0 tasks, so its dot is off. */
  hasTasks: boolean;
  /** Index of this day's card in the carousel axis, or null when the day has no
   *  card — null cells are dimmed and non-tappable. */
  cardIndex: number | null;
  /** The currently viewed card sits on this cell (drives the active marker and
   *  the inverse text color). */
  isActive: boolean;
};

export type DayStripWeek = {
  /** Always length 7, Sunday → Saturday. */
  cells: DayStripCell[];
  /** False when the visible week does not contain today — the signal to show
   *  the "back to today" affordance. */
  containsToday: boolean;
  /** ISO date the week is built around (the current day card, else today). */
  anchorDateKey: string;
};

type BuildDayStripArgs = {
  cards: DayCarouselCard[];
  /** Index of the currently viewed card, or null before one is adopted. */
  currentIndex: number | null;
  today: string;
};

/**
 * Build the visible week. Returns null when there are no cards (the whole lane
 * is hidden — there is nothing to navigate). The week is anchored on the
 * current day card; when the current card is Overdue (or none yet), it falls
 * back to today's week with no active cell.
 */
export function buildDayStrip({
  cards,
  currentIndex,
  today,
}: BuildDayStripArgs): DayStripWeek | null {
  if (cards.length === 0) return null;

  const currentCard =
    currentIndex != null && currentIndex >= 0 && currentIndex < cards.length
      ? cards[currentIndex]
      : null;
  const anchorDateKey =
    currentCard && currentCard.kind === "day" ? currentCard.dateKey : today;

  const anchorDate = isoToDate(anchorDateKey) ?? isoToDate(today);
  if (!anchorDate) return null;

  // Map each day-card's date to its axis index and live task count, so cells
  // can look up their card in one pass.
  const dayCardByKey = new Map<string, { index: number; taskCount: number }>();
  cards.forEach((card, index) => {
    if (card.kind === "day") {
      dayCardByKey.set(card.dateKey, { index, taskCount: card.tasks.length });
    }
  });

  const activeDateKey =
    currentCard && currentCard.kind === "day" ? currentCard.dateKey : null;

  // Sunday of the anchor's week, then the seven days across.
  const sunday = addDays(anchorDate, -anchorDate.getDay());
  const cells: DayStripCell[] = Array.from({ length: 7 }, (_, slot) => {
    const dateKey = toIsoDate(addDays(sunday, slot));
    const card = dayCardByKey.get(dateKey);
    return {
      dateKey,
      weekdayLetter: WEEKDAY_LETTERS[slot],
      dayOfMonth: Number(dateKey.slice(8, 10)),
      isToday: dateKey === today,
      hasTasks: (card?.taskCount ?? 0) > 0,
      cardIndex: card?.index ?? null,
      isActive: dateKey === activeDateKey,
    };
  });

  return {
    cells,
    containsToday: cells.some((cell) => cell.isToday),
    anchorDateKey,
  };
}
