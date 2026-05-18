import { describe, expect, it } from "vitest";
import { buildKairoContext, type KairoTaskInput } from "../lib/kairoApi";

const inbox: KairoTaskInput = { _id: "a1", title: "Inbox A", status: "inbox" };
const sched1: KairoTaskInput = {
  _id: "s1",
  title: "Sched Tue",
  status: "scheduled",
  scheduledDate: "2026-05-19",
};
const sched2: KairoTaskInput = {
  _id: "s2",
  title: "Sched Wed",
  status: "scheduled",
  scheduledDate: "2026-05-20",
};

describe("buildKairoContext", () => {
  it("stamps a [T#] handle on every task and maps it back to the real id", () => {
    const result = buildKairoContext([sched1, sched2, inbox], [inbox]);

    expect(result.text).toMatch(/\[T1\] "Sched Tue"/);
    expect(result.text).toMatch(/\[T2\] "Sched Wed"/);
    expect(result.text).toMatch(/\[T3\] "Inbox A"/);

    expect(result.idMap).toEqual({ T1: "s1", T2: "s2", T3: "a1" });
  });

  it("numbers scheduled tasks before inbox tasks", () => {
    // Pass inbox first in the all-tasks list to make sure ordering is by
    // section (scheduled → inbox), not by input order.
    const result = buildKairoContext([inbox, sched1], [inbox]);
    expect(result.idMap.T1).toBe("s1");
    expect(result.idMap.T2).toBe("a1");
  });

  it("returns an empty idMap when there are no tasks", () => {
    const result = buildKairoContext([], []);
    expect(result.idMap).toEqual({});
    expect(result.text).toMatch(/Inbox \(0 items\):/);
  });
});
