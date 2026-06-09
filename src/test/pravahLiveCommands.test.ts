/// <reference types="node" />
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveStoredCredential } from "../cli/authStore";
import { executeCommand } from "../cli/commands";
import { resolveCliHttpUrl } from "../cli/liveClient";
import type { ParsedArgs } from "../cli/types";

const env = process.env;
const originalHttpUrl = env.PRAVAH_HTTP_URL;
const originalApiKey = env.CONVEX_HTTP_API_KEY;
const originalHome = env.HOME;
let tempHome: string;

function makeArgs(positionals: string[], options: Record<string, string | boolean> = {}): ParsedArgs {
  return { positionals, options };
}

describe("pravah live commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    env.PRAVAH_HTTP_URL = "https://pravah.example.com";
    delete env.CONVEX_HTTP_API_KEY;
    tempHome = mkdtempSync(join(tmpdir(), "pravah-live-reads-"));
    env.HOME = tempHome;
    saveStoredCredential({
      secret: "pravah_cred_demo",
      label: "Laptop",
      scopes: ["tasks:read", "tasks:write", "review:read", "sync:read"],
      ownerTokenIdentifier: "user-1",
      siteUrl: "https://pravah.example.com",
    });
  });

  afterEach(() => {
    if (originalHttpUrl === undefined) delete env.PRAVAH_HTTP_URL;
    else env.PRAVAH_HTTP_URL = originalHttpUrl;

    if (originalApiKey === undefined) delete env.CONVEX_HTTP_API_KEY;
    else env.CONVEX_HTTP_API_KEY = originalApiKey;

    if (originalHome === undefined) delete env.HOME;
    else env.HOME = originalHome;

    rmSync(tempHome, { recursive: true, force: true });
  });

  it("resolves convex site url from cloud fallback", () => {
    expect(
      resolveCliHttpUrl({
        VITE_CONVEX_URL: "https://befitting-swan-125.eu-west-1.convex.cloud",
      })
    ).toBe("https://befitting-swan-125.eu-west-1.convex.site");
  });

  it("uses live reads for tasks list when env is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [{ _id: "live_1", title: "Live scheduled", status: "scheduled" }],
    } as Response);

    const result = await executeCommand(
      { command: "tasks list", json: true },
      makeArgs(["tasks", "list"])
    );

    expect(result).toMatchObject({
      source: "live",
    });
    expect((result as { tasks: Array<{ _id: string }> }).tasks[0]).toMatchObject({
      _id: "live_1",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://pravah.example.com/tasks",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer pravah_cred_demo",
        }),
      })
    );
  });

  it("uses live reads for goals list when env is configured", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/goals")) {
        return {
          ok: true,
          json: async () => [{ id: "goal_1", text: "Planning", priority: "p1" }],
        } as Response;
      }
      if (url.endsWith("/goal-links")) {
        return {
          ok: true,
          json: async () => ({ live_1: "goal_1" }),
        } as Response;
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const result = await executeCommand(
      { command: "goals list", json: true },
      makeArgs(["goals", "list"])
    );

    expect(result).toMatchObject({
      goals: [{ id: "goal_1", text: "Planning", priority: "p1" }],
      links: { live_1: "goal_1" },
      source: "live",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://pravah.example.com/goals",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer pravah_cred_demo",
        }),
      })
    );
  });

  it("builds live agent context from primitive read routes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/tasks")) {
        return {
          ok: true,
          json: async () => [
            {
              _id: "live_1",
              title: "Live scheduled",
              status: "scheduled",
              scheduledDate: "2026-06-05",
            },
            {
              _id: "live_2",
              title: "Live inbox",
              status: "inbox",
            },
          ],
        } as Response;
      }
      if (url.includes("/review-queue")) {
        return {
          ok: true,
          json: async () => [{ _id: "review_1", title: "Review me", status: "pending" }],
        } as Response;
      }
      if (url.endsWith("/goals")) {
        return {
          ok: true,
          json: async () => [{ id: "goal_1", text: "Planning" }],
        } as Response;
      }
      if (url.endsWith("/goal-links")) {
        return {
          ok: true,
          json: async () => ({ live_1: "goal_1" }),
        } as Response;
      }
      if (url.includes("/sync/status")) {
        return {
          ok: true,
          json: async () => ({
            provider: "google_calendar",
            healthy: true,
            lastRunAt: "2026-06-04T12:30:00.000Z",
          }),
        } as Response;
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const result = await executeCommand(
      { command: "agent context", json: true },
      makeArgs(["agent", "context"])
    );

    expect(result).toMatchObject({
      source: "live",
      inboxSummary: { count: 1 },
      goalLinksSummary: { count: 1 },
      reviewQueueSummary: { count: 1 },
    });
    expect((result as { goals: Array<{ id: string; text: string }> }).goals).toEqual([
      { id: "goal_1", text: "Planning" },
    ]);
    expect(
      (result as { scheduled: Array<{ id: string; title: string }> }).scheduled[0]
    ).toMatchObject({
      id: "live_1",
      title: "Live scheduled",
    });
  });

  it("rejects agent context before network calls when aggregate scopes are missing", async () => {
    saveStoredCredential({
      secret: "pravah_cred_limited",
      label: "Limited",
      scopes: ["tasks:read"],
      ownerTokenIdentifier: "user-1",
      siteUrl: "https://pravah.example.com",
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      executeCommand(
        { command: "agent context", json: true },
        makeArgs(["agent", "context"])
      )
    ).rejects.toThrow("review:read, sync:read");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves linked goals for live agent task detail", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/tasks")) {
        return {
          ok: true,
          json: async () => [
            {
              _id: "live_1",
              title: "Live scheduled",
              status: "scheduled",
              scheduledDate: "2026-06-05",
            },
          ],
        } as Response;
      }
      if (url.endsWith("/goals")) {
        return {
          ok: true,
          json: async () => [{ id: "goal_1", text: "Planning" }],
        } as Response;
      }
      if (url.endsWith("/goal-links")) {
        return {
          ok: true,
          json: async () => ({ live_1: "goal_1" }),
        } as Response;
      }
      throw new Error(`Unexpected url: ${url}`);
    });

    const result = await executeCommand(
      { command: "agent task", json: true },
      makeArgs(["agent", "task"], { "task-id": "live_1" })
    );

    expect(result).toMatchObject({
      task: { id: "live_1", title: "Live scheduled" },
      goal: { id: "goal_1", text: "Planning" },
      source: "live",
    });
  });

  it("uses live writes for allowed task mutations with stored credential", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const result = await executeCommand(
      { command: "tasks complete", json: true },
      makeArgs(["tasks", "complete"], { "task-id": "task_live_1" })
    );

    expect(result).toMatchObject({
      action: "tasks.complete",
      source: "live",
      dryRun: false,
      task: { id: "task_live_1" },
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://pravah.example.com/tasks/complete",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer pravah_cred_demo",
          "Idempotency-Key": expect.stringMatching(/^cli_/),
        }),
      })
    );
  });

  it("preserves the idempotency key when a live write fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "Unknown commit state",
    } as Response);

    await expect(
      executeCommand(
        { command: "tasks complete", json: true },
        makeArgs(["tasks", "complete"], {
          "task-id": "task_live_1",
          "idempotency-key": "complete-safe-retry",
        })
      )
    ).rejects.toMatchObject({
      code: "write_failed",
      details: {
        action: "tasks.complete",
        idempotencyKey: "complete-safe-retry",
        retryExactRequestWithSameIdempotencyKey: true,
      },
    });
  });

  it("uses live writes for goal updates and preserves explicit clears", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ updated: true, goalId: "goal_1" }),
    } as Response);

    const result = await executeCommand(
      { command: "goals update", json: true },
      makeArgs(["goals", "update"], {
        "goal-id": "goal_1",
        description: "clear",
        deadline: "clear",
        priority: "clear",
        "idempotency-key": "goal-update-123",
      })
    );

    expect(result).toMatchObject({
      action: "goals.update",
      goal: { id: "goal_1" },
      description: null,
      deadline: null,
      priority: null,
      source: "live",
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://pravah.example.com/goals/update",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer pravah_cred_demo",
          "Idempotency-Key": "goal-update-123",
        }),
        body: JSON.stringify({
          goalId: "goal_1",
          description: null,
          deadline: null,
          priority: null,
        }),
      })
    );
  });

  it("rejects invalid task filters and oversized review limits before network calls", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(
      executeCommand(
        { command: "tasks list", json: true },
        makeArgs(["tasks", "list"], { status: "typo" })
      )
    ).rejects.toThrow("--status must be one of");
    await expect(
      executeCommand(
        { command: "review list", json: true },
        makeArgs(["review", "list"], { limit: "201" })
      )
    ).rejects.toThrow("--limit must be an integer between 1 and 200");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
