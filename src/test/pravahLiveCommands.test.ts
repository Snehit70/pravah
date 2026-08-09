import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadStoredCredential, saveStoredCredential } from "../../packages/cli/src/authStore";
import { executeCommand } from "../../packages/cli/src/commands";
import { renderHumanResult } from "../../packages/cli/src/renderer";

let home: string;
let originalHome: string | undefined;
let originalConfigHome: string | undefined;
let originalHttpUrl: string | undefined;
beforeEach(() => { home = mkdtempSync(join(tmpdir(), "pravah-v2-")); originalHome = process.env.HOME; originalConfigHome = process.env.XDG_CONFIG_HOME; originalHttpUrl = process.env.PRAVAH_HTTP_URL; process.env.HOME = home; process.env.XDG_CONFIG_HOME = join(home, ".config"); process.env.PRAVAH_HTTP_URL = "https://pravah.example.com"; delete process.env.PRAVAH_CLI_MOCK; saveStoredCredential({ secret: "pravah_test", label: "Test", scopes: ["tasks:read", "tasks:write"], ownerTokenIdentifier: "user", siteUrl: "https://pravah.example.com" }); });
afterEach(() => { process.env.HOME = originalHome; if (originalConfigHome === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = originalConfigHome; if (originalHttpUrl === undefined) delete process.env.PRAVAH_HTTP_URL; else process.env.PRAVAH_HTTP_URL = originalHttpUrl; });
afterEach(() => { rmSync(home, { recursive: true, force: true }); vi.restoreAllMocks(); });

describe("Pravah CLI v2 live adapter", () => {
  it("resolves a title target after reading the existing task collection", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.includes("/tasks/get?")
        ? {
            _id: "task_1",
            title: "Ship v2",
            deadline: "2026-07-26",
            priority: "p1",
            imageSummary: { activeCount: 1, readyCount: 1, failedCount: 0 },
            imageCollection: {
              revision: 1,
              observedAt: 100,
              active: [{ taskImageId: "image-1", position: 0, state: "ready" }],
              recoverable: [{ taskImageId: "image-2", caption: "Removed", removedAt: 90, recoverableUntil: 120, previousPosition: 1 }],
            },
          }
        : url.endsWith("/tasks")
          ? [{ _id: "task_1", title: "Ship v2", deadline: "2026-07-26", priority: "p1", imageSummary: { activeCount: 1, readyCount: 1, failedCount: 0 } }]
          : [];
      return { ok: true, json: async () => body } as Response;
    });
    const result = await executeCommand({ command: "tasks show", json: true }, { positionals: ["tasks", "show", "Ship v2"], options: {} });
    expect(result).toMatchObject({ source: "live", task: { id: "task_1", title: "Ship v2", imageSummary: { activeCount: 1 }, imageCollection: { active: [{ taskImageId: "image-1" }], recoverable: [{ taskImageId: "image-2", caption: "Removed" }] } } });
    expect(fetch.mock.calls.map((call) => String(call[0]))).toContain("https://pravah.example.com/tasks/get?taskId=task_1");
  });

  it("adds linked Goal context without requesting held review or sync integrations", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const body = url.endsWith("/automation/credential")
        ? { label: "Live credential", scopes: ["tasks:read", "tasks:write"], ownerTokenIdentifier: "live-user" }
        : [];
      return { ok: true, json: async () => body } as Response;
    });
    await executeCommand({ command: "agent context", json: true }, { positionals: ["agent", "context"], options: {} });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual(expect.arrayContaining(["https://pravah.example.com/automation/credential", "https://pravah.example.com/tasks", "https://pravah.example.com/goals", "https://pravah.example.com/goal-links"]));
    expect(fetch.mock.calls.map((call) => String(call[0]).includes("review") || String(call[0]).includes("sync"))).not.toContain(true);
    expect(loadStoredCredential()).toMatchObject({ label: "Live credential", ownerTokenIdentifier: "live-user" });
  });

  it("uses live scopes refreshed from the credential endpoint before a write", async () => {
    saveStoredCredential({ secret: "pravah_test", label: "Stale credential", scopes: ["tasks:read"], ownerTokenIdentifier: "user", siteUrl: "https://pravah.example.com" });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/automation/credential")) return { ok: true, json: async () => ({ label: "Live credential", scopes: ["tasks:read", "tasks:write"], ownerTokenIdentifier: "live-user" }) } as Response;
      if (url.endsWith("/tasks")) return { ok: true, json: async () => [{ _id: "task_1", title: "Ship v2" }] } as Response;
      return { ok: true, json: async () => ({ operationId: "op_1", undoAvailable: true }) } as Response;
    });
    const result = await executeCommand({ command: "tasks edit", json: true }, { positionals: ["tasks", "edit", "Ship v2"], options: { title: "Ship better", "idempotency-key": "stable" } });
    expect(result).toMatchObject({ operation: { operationId: "op_1" } });
    expect(fetch.mock.calls.map((call) => String(call[0]))).toEqual(expect.arrayContaining(["https://pravah.example.com/automation/credential", "https://pravah.example.com/tasks/update"]));
    expect(loadStoredCredential()).toMatchObject({ label: "Live credential", scopes: ["tasks:read", "tasks:write"], ownerTokenIdentifier: "live-user" });
  });

  it("clears a revoked stored credential instead of reusing stale scopes", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("Unauthorized", { status: 401 }));
    const result = await executeCommand({ command: "auth status", json: true }, { positionals: ["auth", "status"], options: {} });
    expect(result).toMatchObject({ authenticated: false, source: null });
    expect(loadStoredCredential()).toBeNull();
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

  it("keeps compact output unchanged and adds only image counts to long output", () => {
    const data = {
      task: {
        id: "task_1",
        title: "Visual task",
        status: "inbox",
        imageSummary: { activeCount: 3, readyCount: 2, failedCount: 1 },
      },
    };

    const compact = renderHumanResult("tasks list", { tasks: [data.task] }, false);
    const detail = renderHumanResult("tasks show", data, true);

    expect(compact).not.toContain("images");
    expect(detail).toContain("images 3 · 1 failed");
    expect(detail).not.toMatch(/caption|taskImageId|imageCollection/);
  });

  it("forwards all editable Task fields and turns remote write errors into a retryable error", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).endsWith("/tasks")) return { ok: true, json: async () => [{ _id: "task_1", title: "Ship v2" }] } as Response;
      expect(JSON.parse(String(init?.body))).toMatchObject({ taskId: "task_1", title: "Ship better", tags: ["cli"], estimatedMinutes: 45 });
      return { ok: true, json: async () => ({ operationId: "op_1", undoAvailable: true, undoExpiresAt: "2026-08-01T00:00:00.000Z" }) } as Response;
    });
    const result = await executeCommand({ command: "tasks edit", json: true }, { positionals: ["tasks", "edit", "Ship v2"], options: { title: "Ship better", tags: "cli", "estimated-minutes": "45", "idempotency-key": "stable" } });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ operation: { operationId: "op_1", undoExpiresAt: "2026-08-01T00:00:00.000Z" } });
  });
});
