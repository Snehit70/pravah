import { useEffect, useState } from "react";

export const INITIAL_INCREMENTAL_ROWS = 24;
export const INCREMENTAL_ROW_BATCH_SIZE = 24;
export const INCREMENTAL_ROW_BATCH_DELAY_MS = 32;

export function useIncrementalRowCount(totalRows: number) {
  const [rowBudget, setRowBudget] = useState(() => ({
    totalRows,
    visibleRows: Math.min(INITIAL_INCREMENTAL_ROWS, totalRows),
  }));
  const visibleRowCount =
    rowBudget.totalRows === totalRows
      ? rowBudget.visibleRows
      : Math.min(INITIAL_INCREMENTAL_ROWS, totalRows);

  useEffect(() => {
    if (rowBudget.totalRows !== totalRows) {
      const timeout = setTimeout(() => {
        setRowBudget({
          totalRows,
          visibleRows: Math.min(INITIAL_INCREMENTAL_ROWS, totalRows),
        });
      }, 0);
      return () => clearTimeout(timeout);
    }
    if (visibleRowCount >= totalRows) return;
    const timeout = setTimeout(() => {
      setRowBudget((budget) =>
        budget.totalRows === totalRows
          ? {
              totalRows,
              visibleRows: Math.min(
                budget.visibleRows + INCREMENTAL_ROW_BATCH_SIZE,
                totalRows
              ),
            }
          : budget
      );
    }, INCREMENTAL_ROW_BATCH_DELAY_MS);
    return () => clearTimeout(timeout);
  }, [rowBudget.totalRows, totalRows, visibleRowCount]);

  return Math.min(visibleRowCount, totalRows);
}
