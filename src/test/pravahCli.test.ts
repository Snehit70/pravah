/// <reference types="node" />
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cliEntry = resolve(repoRoot, "src/cli/pravah.ts");

function runCli(args: string[]) {
  return spawnSync("bun", ["run", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

describe("pravah CLI", () => {
  it("returns a uniform JSON envelope for successful reads", () => {
    const result = runCli(["tasks", "list", "--status", "scheduled", "--json"]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      ok: true,
      version: "v1",
      command: "tasks list",
    });
    expect(payload.data.tasks).toBeInstanceOf(Array);
    expect(result.stderr).toBe("");
  });

  it("returns structured JSON errors on stdout in json mode", () => {
    const result = runCli(["tasks", "move", "--task-id", "missing", "--target-date", "2026-06-05", "--json"]);

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      ok: false,
      version: "v1",
      command: "tasks move",
      error: {
        code: "command_failed",
      },
    });
    expect(payload.error.message).toContain("Task not found");
  });

  it("auto-generates an idempotency key for write commands", () => {
    const result = runCli(["tasks", "add", "--title", "Draft CLI contract", "--json"]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.data.action).toBe("tasks.add");
    expect(payload.data.idempotencyKey).toMatch(/^cli_/);
  });

  it("preserves dry-run on fake writes", () => {
    const result = runCli([
      "tasks",
      "move",
      "--task-id",
      "task_1",
      "--target-date",
      "2026-06-06",
      "--dry-run",
      "--idempotency-key",
      "move-123",
      "--json",
    ]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.data).toMatchObject({
      action: "tasks.move",
      dryRun: true,
      idempotencyKey: "move-123",
      targetDate: "2026-06-06",
    });
  });

  it("returns bounded agent context", () => {
    const result = runCli(["agent", "context", "--json"]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.data).toMatchObject({
      today: "2026-06-04",
      inboxSummary: {
        count: expect.any(Number),
      },
      reviewQueueSummary: {
        count: expect.any(Number),
      },
      automation: {
        credentialLabel: expect.any(String),
      },
    });
  });
});
