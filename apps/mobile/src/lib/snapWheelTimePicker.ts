export function selectedIndexFromOffset(offsetY: number, itemHeight: number): number {
  if (!Number.isFinite(offsetY)) return 0;
  return Math.max(0, Math.round(offsetY / itemHeight));
}
