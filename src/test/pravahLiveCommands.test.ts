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

  it("does not request held review or sync integrations for agent context", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => [] } as Response);
    await executeCommand({ command: "agent context", json: true }, { positionals: ["agent", "context"], options: {} });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetch.mock.calls[0][0])).toBe("https://pravah.example.com/tasks");
  });
});
