import { mkdirSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { retainDiagnosticEvents } from "../../apps/mobile/src/lib/diagnosticRetention";

// Frozen implementation from main at 55b1275, with the same retention limits
// applied to both implementations. This is a host JS microbenchmark, not FPS.
function previousRetention<T extends { ts: number }>(events: T[], cutoff: number, maxEvents: number, maxSize: number) {
  const bytes = (rows: T[]) => rows.reduce((sum, row) => sum + JSON.stringify(row).length, 0);
  const fresh = events.filter((event) => event.ts >= cutoff);
  if (fresh.length <= maxEvents && bytes(fresh) <= maxSize) return fresh;
  const mutable = [...fresh];
  while (mutable.length > maxEvents || bytes(mutable) > maxSize) mutable.shift();
  return mutable;
}

const events = Array.from({ length: 1200 }, (_, seq) => ({ ts: 1000 + seq, seq, meta: "x".repeat(1024) }));
const size = 600 * JSON.stringify(events[0]).length;
const before = previousRetention(events, 0, 10000, size);
const after = retainDiagnosticEvents(events, 0, 10000, size);
if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Retention semantics changed");
function median(fn: () => unknown) {
  const values = Array.from({ length: 7 }, () => {
    const start = performance.now(); fn(); return performance.now() - start;
  }).sort((a, b) => a - b);
  return values[3];
}
const beforeMs = median(() => previousRetention(events, 0, 10000, size));
const afterMs = median(() => retainDiagnosticEvents(events, 0, 10000, size));
const result = { baseline: "55b1275", method: "Bun host microbenchmark, seven samples, identical byte-limited fixture",
  inputEvents: events.length, retainedEvents: after.length, beforeMedianMs: beforeMs, afterMedianMs: afterMs,
  speedup: beforeMs / afterMs, reductionPercent: (1 - afterMs / beforeMs) * 100 };
mkdirSync("artifacts/mobile-performance", { recursive: true });
writeFileSync("artifacts/mobile-performance/persistence.json", JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (afterMs > beforeMs) throw new Error("Diagnostic retention regressed against the frozen baseline");
