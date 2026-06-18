import { describe, expect, it } from "vitest";

import {
  DEFAULT_TAB_ORDER,
  moveTabOrder,
  resolveTabOrder,
  sanitizeTabOrder,
} from "../lib/tabOrder";

describe("tab order helpers", () => {
  it("accepts a complete permutation of navigation tabs", () => {
    expect(resolveTabOrder(["insights", "inbox", "goals", "timeline"])).toEqual([
      "insights",
      "inbox",
      "goals",
      "timeline",
    ]);
  });

  it("falls back to default for missing, unknown, or duplicate entries", () => {
    expect(sanitizeTabOrder(["inbox", "timeline", "goals"])).toEqual(DEFAULT_TAB_ORDER);
    expect(sanitizeTabOrder(["inbox", "timeline", "goals", "capture"])).toEqual(
      DEFAULT_TAB_ORDER,
    );
    expect(sanitizeTabOrder(["inbox", "timeline", "goals", "goals"])).toEqual(
      DEFAULT_TAB_ORDER,
    );
  });

  it("moves tabs by one slot without allowing out-of-range moves", () => {
    expect(moveTabOrder(DEFAULT_TAB_ORDER, "goals", "up")).toEqual([
      "inbox",
      "goals",
      "timeline",
      "insights",
    ]);
    expect(moveTabOrder(DEFAULT_TAB_ORDER, "inbox", "up")).toEqual(DEFAULT_TAB_ORDER);
    expect(moveTabOrder(DEFAULT_TAB_ORDER, "insights", "down")).toEqual(DEFAULT_TAB_ORDER);
  });
});
