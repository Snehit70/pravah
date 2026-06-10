import { describe, expect, it } from "vitest";
import {
  parseKairoTaskProposals,
  updateKairoTaskProposal,
} from "../lib/kairoTaskProposals";

describe("parseKairoTaskProposals", () => {
  it("extracts pending task proposals without applying them", () => {
    const result = parseKairoTaskProposals(
      'I recommend this.<add-task>{"title":" Plan launch ","deadline":"2026-06-08"}</add-task>'
    );

    expect(result.text).toBe("I recommend this.");
    expect(result.proposals).toEqual([
      {
        title: "Plan launch",
        deadline: "2026-06-08",
        status: "pending",
      },
    ]);
  });

  it("ignores malformed and titleless action blocks", () => {
    const result = parseKairoTaskProposals(
      'Keep this<add-task>{bad json}</add-task><add-task>{"deadline":"2026-06-08"}</add-task>'
    );

    expect(result).toEqual({ text: "Keep this", proposals: [] });
  });

  it("ignores proposals with unsafe task fields", () => {
    const result = parseKairoTaskProposals(
      `<add-task>{"title":"Valid","deadline":"not-a-date"}</add-task>` +
        `<add-task>{"title":"${"x".repeat(501)}"}</add-task>`
    );

    expect(result.proposals).toEqual([]);
  });

  it("updates exactly one proposal status", () => {
    const proposals = parseKairoTaskProposals(
      '<add-task>{"title":"One"}</add-task><add-task>{"title":"Two"}</add-task>'
    ).proposals;

    expect(updateKairoTaskProposal(proposals, 1, { status: "declined" })).toMatchObject([
      { title: "One", status: "pending" },
      { title: "Two", status: "declined" },
    ]);
  });
});
