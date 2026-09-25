import { describe, expect, it } from "vitest";

import {
  DEFAULT_TAB_ORDER,
  TAB_ORDER_GESTURE_ACTIVE_OFFSET_X,
  TAB_ORDER_GESTURE_FAIL_OFFSET_Y,
  getDefaultTabOrder,
  isCurrentTabOrderDragSession,
  moveTabOrder,
  nextTabOrderDragSession,
  reorderTabOrder,
  resolveTabOrder,
  resolveStartupTab,
  sanitizeTabOrder,
  tabOrderSlotOffset,
  tabOrderTargetIndex,
  tabOrderVisualIndex,
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

  it("reorders a complete permutation with the fixed center action left out", () => {
    expect(reorderTabOrder(DEFAULT_TAB_ORDER, 0, 2)).toEqual([
      "timeline",
      "goals",
      "inbox",
      "insights",
    ]);
    expect(reorderTabOrder(DEFAULT_TAB_ORDER, 3, 1)).toEqual([
      "inbox",
      "insights",
      "timeline",
      "goals",
    ]);
    expect(reorderTabOrder(DEFAULT_TAB_ORDER, 1, 1)).toEqual(DEFAULT_TAB_ORDER);
  });

  it("keeps horizontal activation separate from vertical parent scrolling", () => {
    expect(TAB_ORDER_GESTURE_ACTIVE_OFFSET_X).toEqual([-8, 8]);
    expect(TAB_ORDER_GESTURE_FAIL_OFFSET_Y).toEqual([-12, 12]);
  });

  it("maps the four reorderable cards around the fixed Capture gap", () => {
    const slotWidth = 80;
    const offsets = [0, 1, 2, 3].map((index) => tabOrderSlotOffset(index, slotWidth));

    expect(offsets).toEqual([0, 84, 220, 304]);
    expect(tabOrderTargetIndex(0, 220, 4, slotWidth)).toBe(2);
    expect(tabOrderTargetIndex(3, -220, 4, slotWidth)).toBe(1);
    expect(tabOrderTargetIndex(0, 0, 4, 0)).toBe(0);
  });

  it("derives neighbor positions from the active source and target", () => {
    expect([0, 1, 2, 3].map((index) => tabOrderVisualIndex(index, 0, 2))).toEqual([
      2, 0, 1, 3,
    ]);
    expect([0, 1, 2, 3].map((index) => tabOrderVisualIndex(index, 3, 1))).toEqual([
      0, 2, 3, 1,
    ]);
    expect(tabOrderVisualIndex(2, -1, -1)).toBe(2);
  });

  it("creates a fresh canonical order for Reset", () => {
    const resetOrder = getDefaultTabOrder();

    expect(resetOrder).toEqual(DEFAULT_TAB_ORDER);
    expect(resetOrder).not.toBe(DEFAULT_TAB_ORDER);
  });

  it("rejects a late drag callback after Reset advances the session", () => {
    const activeSession = nextTabOrderDragSession(4);

    expect(activeSession).toBe(5);
    expect(isCurrentTabOrderDragSession(activeSession, activeSession)).toBe(true);
    expect(isCurrentTabOrderDragSession(activeSession, activeSession - 1)).toBe(false);
  });

  it("uses the first resolved tab as the startup tab", () => {
    expect(resolveStartupTab(["goals", "timeline", "inbox", "insights"])).toBe("goals");
    expect(resolveStartupTab(["goals", "timeline", "inbox"])).toBe("inbox");
  });
});
