/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeCommand } from "../cli/commands";
import { resolveCliHttpUrl } from "../cli/liveReads";
import type { ParsedArgs } from "../cli/types";

const env = process.env;
const originalHttpUrl = env.PRAVAH_HTTP_URL;
const originalApiKey = env.CONVEX_HTTP_API_KEY;

function makeArgs(positionals: string[], options: Record<string, string | boolean> = {}): ParsedArgs {
  return { positionals, options };
}

describe("pravah live reads", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    env.PRAVAH_HTTP_URL = "https://pravah.example.com";
    env.CONVEX_HTTP_API_KEY = "test-key";
  });

  afterEach(() => {
    if (originalHttpUrl === undefined) delete env.PRAVAH_HTTP_URL;
    else env.PRAVAH_HTTP_URL = originalHttpUrl;

    if (originalApiKey === undefined) delete env.CONVEX_HTTP_API_KEY;
    else env.CONVEX_HTTP_API_KEY = originalApiKey;
  });

  it("resolves convex site url from cloud fallback", () => {
    expect(
      resolveCliHttpUrl({
        VITE_CONVEX_URL: "https://befitting-swan-125.eu-west-1.convex.cloud",
      })
    ).toBe("https://befitting-swan-125.eu-west-1.convex.site");
  });

  it("uses live reads for tasks list when env is configured", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
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
      reviewQueueSummary: { count: 1 },
    });
    expect(
      (result as { scheduled: Array<{ id: string; title: string }> }).scheduled[0]
    ).toMatchObject({
      id: "live_1",
      title: "Live scheduled",
    });
  });
});
