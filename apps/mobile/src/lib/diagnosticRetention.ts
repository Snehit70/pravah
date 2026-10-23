/** Retain the newest events with one size calculation per candidate. */
export function retainDiagnosticEvents<T extends { ts: number }>(
  events: readonly T[],
  cutoff: number,
  maxEvents: number,
  maxSize: number,
): T[] {
  const retained: T[] = [];
  let size = 0;
  for (let index = events.length - 1; index >= 0 && retained.length < maxEvents; index -= 1) {
    const event = events[index];
    if (!(event.ts >= cutoff)) continue;
    const eventSize = JSON.stringify(event).length;
    // Keep a contiguous newest suffix, matching the previous oldest-first
    // pruning policy even if a single oversized event cannot fit.
    if (size + eventSize > maxSize) break;
    size += eventSize;
    retained.push(event);
  }
  return retained.reverse();
}
