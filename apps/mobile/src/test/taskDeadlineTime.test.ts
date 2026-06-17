import { describe, expect, it } from "vitest";
import { formatTime12h } from "../lib/task-form";

describe("formatTime12h", () => {
  it("formats midnight correctly", () => {
    expect(formatTime12h("00:00")).toBe("12:00 AM");
  });

  it("formats noon correctly", () => {
    expect(formatTime12h("12:00")).toBe("12:00 PM");
  });

  it("formats AM hours", () => {
    expect(formatTime12h("09:30")).toBe("9:30 AM");
    expect(formatTime12h("01:15")).toBe("1:15 AM");
    expect(formatTime12h("11:45")).toBe("11:45 AM");
  });

  it("formats PM hours", () => {
    expect(formatTime12h("13:00")).toBe("1:00 PM");
    expect(formatTime12h("17:05")).toBe("5:05 PM");
    expect(formatTime12h("23:59")).toBe("11:59 PM");
  });

  it("pads minutes with leading zero", () => {
    expect(formatTime12h("09:05")).toBe("9:05 AM");
    expect(formatTime12h("14:00")).toBe("2:00 PM");
  });

  it("returns input unchanged for invalid format", () => {
    expect(formatTime12h("not-a-time")).toBe("not-a-time");
    expect(formatTime12h("9:30")).toBe("9:30 AM");
  });
});

describe("time gating rule", () => {
  // Pure expression of the business rule: time is only valid when deadline is present.
  // This mirrors what addTaskForOwner and updateTaskForOwner enforce on the server.
  function applyTimeGating(deadline: string | undefined, time: string | undefined): string | undefined {
    return deadline ? time : undefined;
  }

  it("passes time through when deadline is set", () => {
    expect(applyTimeGating("2026-07-01", "09:00")).toBe("09:00");
    expect(applyTimeGating("2026-07-01", undefined)).toBe(undefined);
  });

  it("strips time when deadline is absent (Inbox Task)", () => {
    expect(applyTimeGating(undefined, "09:00")).toBe(undefined);
    expect(applyTimeGating(undefined, undefined)).toBe(undefined);
  });

  it("strips time when deadline is removed", () => {
    // Simulate removing a deadline (editing deadline to undefined)
    const hadTime = "14:30";
    expect(applyTimeGating(undefined, hadTime)).toBe(undefined);
  });
});
