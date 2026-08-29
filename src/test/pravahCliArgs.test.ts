import { describe, expect, it } from "vitest";
import { parseArgs } from "../../packages/cli/src/args";

describe("Pravah CLI argument parsing", () => {
  it("treats arguments after -- as positional values", () => {
    expect(
      parseArgs([
        "tasks",
        "add",
        "--deadline",
        "2026-08-29",
        "--json",
        "--",
        "--review notes",
      ])
    ).toEqual({
      positionals: ["tasks", "add", "--review notes"],
      options: {
        deadline: "2026-08-29",
        json: true,
      },
    });
  });
});
