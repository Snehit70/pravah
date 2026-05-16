import { useEffect, useState } from "react";

export const INITIAL_INCREMENTAL_ROWS = 24;
export const INCREMENTAL_ROW_BATCH_SIZE = 24;
export const INCREMENTAL_ROW_BATCH_DELAY_MS = 32;

export function useIncrementalRowCount(totalRows: number) {
  const [visibleRowCount, setVisibleRowCount] = useState(() =>
    Math.min(INITIAL_INCREMENTAL_ROWS, totalRows)
  );

  useEffect(() => {
    // Never hard-reset on a totalRows change. A live update (task
    // added/completed while the user is scrolled deep) must preserve the
    // existing visible budget instead of collapsing back to
    // INITIAL_INCREMENTAL_ROWS and jumping the scroll position. Shrink is
    // handled inline by the returned `Math.min(visibleRowCount, totalRows)`
    // below, so we don't need to chase the state down to match — when
    // totalRows climbs back, the preserved budget snaps the user's previous
    // depth into view again.
    if (visibleRowCount >= totalRows) return;
    const timeout = setTimeout(() => {
      setVisibleRowCount((current) =>
        Math.min(current + INCREMENTAL_ROW_BATCH_SIZE, totalRows)
      );
    }, INCREMENTAL_ROW_BATCH_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [totalRows, visibleRowCount]);

  // Floor to INITIAL_INCREMENTAL_ROWS (clamped to totalRows) so the first
  // paint after data arrives shows the initial budget immediately — `useState`
  // doesn't re-run when totalRows transitions from 0 to populated, so without
  // this floor the screen briefly renders the empty state until the 32ms
  // batch timer fires and bumps visibleRowCount off zero.
  return Math.min(
    Math.max(visibleRowCount, Math.min(INITIAL_INCREMENTAL_ROWS, totalRows)),
    totalRows
  );
}
