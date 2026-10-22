import { describe, expect, it } from "vitest";
import { retainDiagnosticEvents } from "../lib/diagnosticRetention";

describe("diagnostic retention", () => {
  const rows = [{ ts: 1, seq: 1 }, { ts: 2, seq: 2 }, { ts: 3, seq: 3 }];
  it("preserves order and newest count after expiry", () => {
    expect(retainDiagnosticEvents(rows, 2, 1, 1000)).toEqual([rows[2]]);
  });
  it("keeps the same newest suffix under the serialized-size budget", () => {
    const size = JSON.stringify(rows[2]).length;
    expect(retainDiagnosticEvents(rows, 0, 10, size)).toEqual([rows[2]]);
    expect(retainDiagnosticEvents(rows, 0, 10, size - 1)).toEqual([]);
  });
  it("visits only the retained suffix under a count cap", () => {
    let serialized = 0;
    const events = Array.from({ length: 1000 }, (_, ts) => ({
      ts, toJSON() { serialized += 1; return { ts }; },
    }));
    expect(retainDiagnosticEvents(events, 0, 20, Infinity)).toHaveLength(20);
    expect(serialized).toBe(20);
  });
});
