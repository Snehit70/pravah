import { describe, expect, it } from "vitest";
import { buildKairoStarters, type KairoTaskInput } from "../lib/kairoApi";

const TODAY = "2026-05-18";

let nextId = 0;
function scheduled(date: string, title = "t"): KairoTaskInput {
  return { _id: `t${++nextId}`, title, deadline: date };
}

function inbox(title = "t"): KairoTaskInput {
  return { _id: `t${++nextId}`, title };
}

describe("buildKairoStarters", () => {
  it("returns evergreen prompts when the workspace is empty", () => {
    const result = buildKairoStarters([], [], TODAY);
    expect(result).toHaveLength(4);
    expect(result).toContain("Plan my week");
  });

  it("surfaces overdue count when there are overdue tasks", () => {
    const tasks = [scheduled("2026-05-10"), scheduled("2026-05-12")];
    const result = buildKairoStarters(tasks, [], TODAY);
    expect(result[0]).toBe("What's overdue? (2)");
  });

  it("suggests today triage when there are due-today tasks", () => {
    const tasks = [scheduled(TODAY)];
    const result = buildKairoStarters(tasks, [], TODAY);
    expect(result).toContain("What's on today?");
  });

  it("suggests inbox triage when inbox has at least 3 items", () => {
    const result = buildKairoStarters([], [inbox(), inbox(), inbox()], TODAY);
    expect(result).toContain("Triage my inbox (3)");
  });

  it("never returns more than four starters", () => {
    const many = Array.from({ length: 10 }, () => scheduled("2026-05-10"));
    const result = buildKairoStarters(many, [inbox(), inbox(), inbox()], TODAY);
    expect(result).toHaveLength(4);
  });

  it("does not duplicate overdue prompt when both contextual and evergreen apply", () => {
    const tasks = [scheduled("2026-05-10")];
    const result = buildKairoStarters(tasks, [], TODAY);
    const overdueCount = result.filter((s) => s.startsWith("What's overdue?")).length;
    expect(overdueCount).toBe(1);
  });
});
