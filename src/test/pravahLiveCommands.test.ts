import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveStoredCredential } from "../../packages/cli/src/authStore";
import { executeCommand } from "../../packages/cli/src/commands";

let home: string;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "pravah-v2-")); process.env.HOME = home; process.env.PRAVAH_HTTP_URL = "https://pravah.example.com"; delete process.env.PRAVAH_CLI_MOCK; saveStoredCredential({ secret: "pravah_test", label: "Test", scopes: ["tasks:read", "tasks:write"], ownerTokenIdentifier: "user", siteUrl: "https://pravah.example.com" }); });
afterEach(() => { rmSync(home, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe("Pravah CLI v2 live adapter", () => {
  it("resolves a title target after reading the existing task collection", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => [{ _id: "task_1", title: "Ship v2", deadline: "2026-07-26", priority: "p1" }] } as Response);
    const result = await executeCommand({ command: "tasks show", json: true }, { positionals: ["tasks", "show", "Ship v2"], options: {} });
    expect(result).toMatchObject({ source: "live", task: { id: "task_1", title: "Ship v2" } });
  });

  it("adds linked Goal context without requesting held review or sync integrations", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    await executeCommand({ command: "agent context", json: true }, { positionals: ["agent", "context"], options: {} });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual(expect.arrayContaining(["https://pravah.example.com/tasks", "https://pravah.example.com/goals", "https://pravah.example.com/goal-links"]));
    expect(fetch.mock.calls.map((call) => String(call[0]).includes("review") || String(call[0]).includes("sync"))).not.toContain(true);
  });

  it("applies goal, priority, and date filters before listing live tasks", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/tasks") ? [
        { _id: "task_1", title: "Relevant", deadline: "2026-07-27", priority: "p1", tags: ["exam"] },
        { _id: "task_2", title: "Other", deadline: "2026-07-27", priority: "p2", tags: ["home"] },
      ] : url.endsWith("/goals") ? [{ id: "goal_1", text: "MLT" }] : { task_1: "goal_1" };
      return { ok: true, json: async () => body } as Response;
    });
    const result = await executeCommand({ command: "tasks list", json: true }, { positionals: ["tasks", "list"], options: { all: true, goal: "MLT", priority: "p1", date: "2026-07-27" } });
    expect(result).toMatchObject({ tasks: [{ id: "task_1", goal: { text: "MLT" } }] });
  });

  it("forwards all editable Task fields and turns remote write errors into a retryable error", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/tasks")) return { ok: true, json: async () => [{ _id: "task_1", title: "Ship v2" }] } as Response;
      expect(JSON.parse(String(init?.body))).toMatchObject({ taskId: "task_1", title: "Ship better", tags: ["cli"], estimatedMinutes: 45 });
      return { ok: true, json: async () => ({ operationId: "op_1", undoAvailable: true, undoExpiresAt: "2026-08-01T00:00:00.000Z" }) } as Response;
    });
    const result = await executeCommand({ command: "tasks edit", json: true }, { positionals: ["tasks", "edit", "Ship v2"], options: { title: "Ship better", tags: "cli", "estimated-minutes": "45", "idempotency-key": "stable" } });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ operation: { operationId: "op_1", undoExpiresAt: "2026-08-01T00:00:00.000Z" } });
  });
});
