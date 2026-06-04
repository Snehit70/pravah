/// <reference types="node" />
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cliEntry = resolve(repoRoot, "src/cli/pravah.ts");

function runCli(args: string[], env?: Record<string, string>) {
  return spawnSync("bun", ["run", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env,
    },
  });
}

function runCliAsync(args: string[], env?: Record<string, string>) {
  return new Promise<{
    status: number | null;
    stdout: string;
    stderr: string;
  }>((resolvePromise, rejectPromise) => {
    const child = spawn("bun", ["run", cliEntry, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", rejectPromise);
    child.on("close", (status) => {
      resolvePromise({
        status,
        stdout,
        stderr,
      });
    });
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

  it("imports a credential file into local CLI storage", () => {
    const home = mkdtempSync(join(tmpdir(), "pravah-cli-home-"));
    const credentialPath = join(home, "credential.json");
    writeFileSync(
      credentialPath,
      JSON.stringify({
        secret: "pravah_cred_imported",
        label: "Laptop",
        scopes: ["tasks:read", "agent:read"],
        ownerTokenIdentifier: "user-1",
        userId: "user-1",
        email: "user@example.com",
        siteUrl: "https://pravah.example.com",
      }),
      "utf8"
    );

    const importResult = runCli(
      ["auth", "import", "--credential-file", credentialPath, "--json"],
      { HOME: home }
    );
    expect(importResult.status).toBe(0);

    const whoamiResult = runCli(["auth", "whoami", "--json"], { HOME: home });
    expect(whoamiResult.status).toBe(0);
    const payload = JSON.parse(whoamiResult.stdout);
    expect(payload.data).toMatchObject({
      credentialLabel: "Laptop",
      ownerTokenIdentifier: "user-1",
      siteUrl: "https://pravah.example.com",
      source: "local",
    });
  });

  it("exchanges a bootstrap token over HTTP and stores the returned credential", async () => {
    const home = mkdtempSync(join(tmpdir(), "pravah-cli-home-"));
    const server = createServer((request, response) => {
      if (
        request.method === "POST" &&
        request.url === "/automation/bootstrap/exchange"
      ) {
        const host = request.headers.host;
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(
          JSON.stringify({
            credential: {
              secret: "pravah_cred_live",
              label: "Codex local",
              scopes: ["tasks:read", "tasks:write", "agent:read"],
              ownerTokenIdentifier: "user-1",
              siteUrl: host ? `http://${host}` : undefined,
            },
          })
        );
        return;
      }

      response.writeHead(404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "Not found" }));
    });

    await new Promise<void>((resolvePromise, rejectPromise) => {
      server.listen(0, "127.0.0.1", () => resolvePromise());
      server.once("error", rejectPromise);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Failed to determine test server address");
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const importResult = await runCliAsync(
        ["auth", "import", "--bootstrap-token", "pravah_bootstrap_demo", "--json"],
        {
          HOME: home,
          PRAVAH_HTTP_URL: baseUrl,
        }
      );
      expect(importResult.status).toBe(0);
      const importPayload = JSON.parse(importResult.stdout);
      expect(importPayload.data).toMatchObject({
        imported: true,
        credentialLabel: "Codex local",
        ownerTokenIdentifier: "user-1",
        siteUrl: baseUrl,
        source: "bootstrap-token",
      });

      const whoamiResult = await runCliAsync(["auth", "whoami", "--json"], { HOME: home });
      expect(whoamiResult.status).toBe(0);
      const whoamiPayload = JSON.parse(whoamiResult.stdout);
      expect(whoamiPayload.data).toMatchObject({
        credentialLabel: "Codex local",
        ownerTokenIdentifier: "user-1",
        siteUrl: baseUrl,
        source: "local",
      });
    } finally {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.close((error) => {
          if (error) rejectPromise(error);
          else resolvePromise();
        });
      });
    }
  });
});
