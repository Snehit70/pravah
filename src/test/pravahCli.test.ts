/// <reference types="node" />
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const cliEntry = resolve(repoRoot, "src/cli/pravah.ts");

function buildCliEnv(env?: Record<string, string>) {
  return {
    ...process.env,
    HOME: env?.HOME ?? mkdtempSync(join(tmpdir(), "pravah-cli-test-home-")),
    PRAVAH_CLI_MOCK: env?.PRAVAH_CLI_MOCK ?? "1",
    ...env,
  };
}

function runCli(args: string[], env?: Record<string, string>) {
  return spawnSync("bun", ["run", cliEntry, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: buildCliEnv(env),
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
      env: buildCliEnv(env),
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

  it("fails clearly instead of silently using mock data without auth", () => {
    const result = runCli(["tasks", "list", "--json"], {
      PRAVAH_CLI_MOCK: "0",
    });

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.error.message).toContain("not authenticated");
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
    expect(JSON.parse(importResult.stdout).data.source).toBe("credential-file");

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

  it("requires exactly one credential import source", () => {
    const result = runCli(
      [
        "auth",
        "import",
        "--bootstrap-token",
        "pravah_bootstrap_demo",
        "--credential-json",
        "{}",
        "--json",
      ],
      { PRAVAH_CLI_MOCK: "0" }
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).error.message).toContain("exactly one");
  });

  it("writes the local audit log under XDG state with private permissions", () => {
    const stateHome = mkdtempSync(join(tmpdir(), "pravah-cli-state-"));
    const result = runCli(["tasks", "list", "--json"], {
      XDG_STATE_HOME: stateHome,
    });

    expect(result.status).toBe(0);
    expect(statSync(join(stateHome, "pravah")).mode & 0o777).toBe(0o700);
    expect(statSync(join(stateHome, "pravah", "cli-audit.log")).mode & 0o777).toBe(
      0o600
    );
  });

  it("exchanges a bootstrap token over HTTP and stores the returned credential", async () => {
    const home = mkdtempSync(join(tmpdir(), "pravah-cli-home-"));
    let sawBearerWrite = false;
    let sawIdempotencyKey = false;
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

      if (
        request.method === "POST" &&
        request.url === "/tasks/complete"
      ) {
        sawBearerWrite = request.headers.authorization === "Bearer pravah_cred_live";
        sawIdempotencyKey =
          typeof request.headers["idempotency-key"] === "string" &&
          request.headers["idempotency-key"].startsWith("cli_");
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ success: true, replayed: false }));
        return;
      }

      if (
        request.method === "POST" &&
        request.url === "/tasks/unschedule"
      ) {
        response.writeHead(503, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ error: "Unknown commit state" }));
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
          PRAVAH_CLI_MOCK: "0",
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

      const whoamiResult = await runCliAsync(["auth", "whoami", "--json"], {
        HOME: home,
        PRAVAH_CLI_MOCK: "0",
      });
      expect(whoamiResult.status).toBe(0);
      const whoamiPayload = JSON.parse(whoamiResult.stdout);
      expect(whoamiPayload.data).toMatchObject({
        credentialLabel: "Codex local",
        ownerTokenIdentifier: "user-1",
        siteUrl: baseUrl,
        source: "local",
      });

      const completeResult = await runCliAsync(
        ["tasks", "complete", "--task-id", "task_live_1", "--json"],
        { HOME: home, PRAVAH_CLI_MOCK: "0" }
      );
      expect(completeResult.status).toBe(0);
      const completePayload = JSON.parse(completeResult.stdout);
      expect(completePayload.data).toMatchObject({
        action: "tasks.complete",
        source: "live",
        task: { id: "task_live_1" },
      });
      expect(sawBearerWrite).toBe(true);
      expect(sawIdempotencyKey).toBe(true);

      const failedWriteResult = await runCliAsync(
        ["tasks", "unschedule", "--task-id", "task_live_1", "--json"],
        { HOME: home, PRAVAH_CLI_MOCK: "0" }
      );
      expect(failedWriteResult.status).toBe(1);
      const failedWritePayload = JSON.parse(failedWriteResult.stdout);
      expect(failedWritePayload.error).toMatchObject({
        code: "write_failed",
        details: {
          action: "tasks.unschedule",
          idempotencyKey: expect.stringMatching(/^cli_/),
          retryExactRequestWithSameIdempotencyKey: true,
        },
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
