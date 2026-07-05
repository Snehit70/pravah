import type { MobileTask } from "../components/TaskCard";

/**
 * Axis construction for the comfortable-mode day carousel (PRD:
 * docs/prd/mobile-timeline-comfortable-carousel.md).
 *
 * Only dates that have tasks become cards — no empty-day filler. Overdue
 * collapses into a single muted card at the far left. A "held" date lets the
 * currently viewed card stay on the axis after its last task is completed
 * (the Day-clear state) until the user swipes away.
 */

export type DayCarouselCard =
  | { kind: "overdue"; count: number }
  | { kind: "day"; dateKey: string; tasks: MobileTask[] };

/** Stable identity for a card across axis rebuilds. */
export const OVERDUE_CARD_KEY = "overdue";

export function cardKey(card: DayCarouselCard): string {
  return card.kind === "overdue" ? OVERDUE_CARD_KEY : card.dateKey;
}

type BuildDayCardsArgs = {
  /** Date-sorted sections as produced by useTaskQueries (may include overdue). */
  sections: [string, MobileTask[]][];
  today: string;
  /** Workspace-wide overdue total; falls back to a local count of dropped sections. */
  overdueCount?: number;
  /** Overdue collapses to a card only when the triage door exists. */
  includeOverdueCard: boolean;
  /** Date of the currently viewed card — kept on the axis (as an empty day)
   *  even when live data no longer has tasks for it. */
  heldDateKey?: string | null;
};

export function buildDayCards({
  sections,
  today,
  overdueCount,
  includeOverdueCard,
  heldDateKey,
}: BuildDayCardsArgs): { cards: DayCarouselCard[]; landingIndex: number } {
  const days: DayCarouselCard[] = [];
  let localOverdue = 0;

  for (const [dateKey, tasks] of sections) {
    if (dateKey === "overdue" || dateKey < today) {
      localOverdue += tasks.length;
    } else {
      days.push({ kind: "day", dateKey, tasks });
    }
  }

  // Re-insert the held date at its sorted position when live data dropped it,
  // so the viewed card can show "Day clear" instead of vanishing mid-look.
  if (heldDateKey && heldDateKey >= today && !days.some((d) => d.kind === "day" && d.dateKey === heldDateKey)) {
    const at = days.findIndex((d) => d.kind === "day" && d.dateKey > heldDateKey);
    const held: DayCarouselCard = { kind: "day", dateKey: heldDateKey, tasks: [] };
    if (at === -1) days.push(held);
    else days.splice(at, 0, held);
  }

  const effectiveOverdue = overdueCount ?? localOverdue;
  const cards: DayCarouselCard[] =
    includeOverdueCard && effectiveOverdue > 0
      ? [{ kind: "overdue", count: effectiveOverdue }, ...days]
      : days;

  return { cards, landingIndex: findLandingIndex(cards, today) };
}

/** Land on Today; else the first upcoming day; the Overdue card is never the
 *  landing target unless it is the only card. */
export function findLandingIndex(cards: DayCarouselCard[], today: string): number {
  const todayIndex = cards.findIndex((c) => c.kind === "day" && c.dateKey === today);
  if (todayIndex !== -1) return todayIndex;
  const firstDay = cards.findIndex((c) => c.kind === "day");
  if (firstDay !== -1) return firstDay;
  return 0;
}
