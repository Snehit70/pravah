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
  const home = env?.HOME ?? mkdtempSync(join(tmpdir(), "pravah-cli-test-home-"));
  return {
    ...process.env,
    HOME: home,
    XDG_CONFIG_HOME: env?.XDG_CONFIG_HOME ?? join(home, ".config"),
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
    const result = runCli(["tasks", "list", "--status", "timeline", "--json"]);

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

  it("returns goals through the mock CLI surface", () => {
    const result = runCli(["goals", "list", "--json"]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      ok: true,
      version: "v1",
      command: "goals list",
    });
    expect(payload.data.goals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "goal_1", text: "Planning" }),
      ])
    );
    expect(payload.data.links).toMatchObject({ task_1: "goal_1" });
  });

  it("supports mock goal updates and explicit clear values", () => {
    const result = runCli([
      "goals",
      "update",
      "--goal-id",
      "goal_1",
      "--description",
      "clear",
      "--deadline",
      "clear",
      "--priority",
      "clear",
      "--json",
    ]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      ok: true,
      version: "v1",
      command: "goals update",
      data: {
        action: "goals.update",
        goal: { id: "goal_1" },
        description: null,
        deadline: null,
        priority: null,
        source: "mock",
      },
    });
  });


  it("fails clearly instead of silently using mock data without auth", () => {
    const result = runCli(["tasks", "list", "--json"], {
      PRAVAH_CLI_MOCK: "0",
      PRAVAH_HTTP_URL: "",
      CONVEX_HTTP_API_KEY: "",
      CONVEX_SITE_URL: "",
      VITE_CONVEX_SITE_URL: "",
      CONVEX_URL: "",
      VITE_CONVEX_URL: "",
    });

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload.error.message).toContain("not authenticated");
  });

  it("returns structured JSON errors on stdout", () => {
    const result = runCli(["tasks", "move", "--task-id", "missing", "--target-date", "2026-06-05", "--json"]);

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      ok: false,
      version: "v1",
      command: "tasks move",
      error: {
        code: "not_found",
      },
    });
    expect(payload.error.message).toContain("Task not found");
    expect(result.stderr).toBe("");
  });

  it("returns structured JSON errors even without json mode", () => {
    const result = runCli(["tasks", "move", "--task-id", "missing", "--target-date", "2026-06-05"]);

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      ok: false,
      version: "v1",
      command: "tasks move",
      error: {
        code: "not_found",
      },
    });
    expect(result.stderr).toBe("");
  });

  it("auto-generates an idempotency key for write commands", () => {
    const result = runCli(["tasks", "add", "--title", "Draft CLI contract", "--json"]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.data.action).toBe("tasks.add");
    expect(payload.data.idempotencyKey).toMatch(/^cli_/);
  });

  it("accepts richer task add fields in dry-run mode", () => {
    const result = runCli([
      "tasks",
      "add",
      "--title",
      "Draft CLI contract",
      "--description",
      "Add the missing fields",
      "--deadline",
      "2026-06-21",
      "--priority",
      "p2",
      "--estimated-minutes",
      "30",
      "--tags",
      "cli,automation",
      "--dry-run",
      "--json",
    ]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.data).toMatchObject({
      action: "tasks.add",
      title: "Draft CLI contract",
      description: "Add the missing fields",
      deadline: "2026-06-21",
      priority: "p2",
      estimatedMinutes: 30,
      tags: ["cli", "automation"],
      dryRun: true,
    });
  });

  it("supports bounded task updates in dry-run mode", () => {
    const result = runCli([
      "tasks",
      "update",
      "--task-id",
      "task_1",
      "--description",
      "clear",
      "--deadline",
      "2026-06-22",
      "--priority",
      "p1",
      "--estimated-minutes",
      "clear",
      "--tags",
      "cli,shipping",
      "--dry-run",
      "--json",
    ]);

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload.data).toMatchObject({
      action: "tasks.update",
      taskId: "task_1",
      description: null,
      deadline: "2026-06-22",
      priority: "p1",
      estimatedMinutes: null,
      tags: ["cli", "shipping"],
      dryRun: true,
    });
  });

  it("rejects invalid richer task add fields before execution", () => {
    const badPriority = runCli([
      "tasks",
      "add",
      "--title",
      "Draft CLI contract",
      "--priority",
      "p4",
      "--json",
    ]);
    expect(badPriority.status).toBe(1);
    expect(JSON.parse(badPriority.stdout).error.message).toContain(
      "--priority must be one of: p1, p2, p3"
    );

    const badEstimate = runCli([
      "tasks",
      "add",
      "--title",
      "Draft CLI contract",
      "--estimated-minutes",
      "0",
      "--json",
    ]);
    expect(badEstimate.status).toBe(1);
    expect(JSON.parse(badEstimate.stdout).error.message).toContain(
      "--estimated-minutes must be a positive integer"
    );

    const badTags = runCli([
      "tasks",
      "add",
      "--title",
      "Draft CLI contract",
      "--tags",
      " , ",
      "--json",
    ]);
    expect(badTags.status).toBe(1);
    expect(JSON.parse(badTags.stdout).error.message).toContain(
      "--tags must include at least one non-empty tag"
    );
  });

  it("rejects invalid task update payloads before execution", () => {
    const noFields = runCli([
      "tasks",
      "update",
      "--task-id",
      "task_1",
      "--json",
    ]);
    expect(noFields.status).toBe(1);
    expect(JSON.parse(noFields.stdout).error.message).toContain(
      "tasks update requires at least one of"
    );

    const badPriority = runCli([
      "tasks",
      "update",
      "--task-id",
      "task_1",
      "--priority",
      "p4",
      "--json",
    ]);
    expect(badPriority.status).toBe(1);
    expect(JSON.parse(badPriority.stdout).error.message).toContain(
      "--priority must be one of: p1, p2, p3, or `clear`"
    );
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

  it("fails closed on unknown options and malformed flags", () => {
    const typoResult = runCli([
      "tasks",
      "complete",
      "--task-id",
      "task_1",
      "--dryrun",
      "--json",
    ]);
    expect(typoResult.status).toBe(1);
    expect(JSON.parse(typoResult.stdout).error.message).toContain(
      "Unknown option --dryrun"
    );

    const valuedFlagResult = runCli([
      "tasks",
      "complete",
      "--task-id",
      "task_1",
      "--dry-run",
      "false",
      "--json",
    ]);
    expect(valuedFlagResult.status).toBe(1);
    expect(JSON.parse(valuedFlagResult.stdout).error.message).toContain(
      "--dry-run does not accept a value"
    );
  });

  it("rejects extra positionals and malformed idempotency keys", () => {
    const positionalResult = runCli([
      "tasks",
      "complete",
      "unexpected",
      "--task-id",
      "task_1",
      "--json",
    ]);
    expect(positionalResult.status).toBe(1);
    expect(JSON.parse(positionalResult.stdout).error.message).toContain(
      "Unexpected positional arguments"
    );

    const keyResult = runCli([
      "tasks",
      "complete",
      "--task-id",
      "task_1",
      "--idempotency-key",
      "x".repeat(201),
      "--json",
    ]);
    expect(keyResult.status).toBe(1);
    expect(JSON.parse(keyResult.stdout).error.message).toContain(
      "--idempotency-key must be between 1 and 200 characters"
    );

    const blankKeyResult = runCli([
      "tasks",
      "complete",
      "--task-id",
      "task_1",
      "--idempotency-key",
      "   ",
      "--json",
    ]);
    expect(blankKeyResult.status).toBe(1);
    expect(JSON.parse(blankKeyResult.stdout).error.message).toContain(
      "--idempotency-key must be between 1 and 200 characters"
    );
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

  it("supports focused task and goal reads through the mock CLI surface", () => {
    const taskResult = runCli(["tasks", "get", "--task-id", "task_2", "--json"]);
    expect(taskResult.status).toBe(0);
    expect(JSON.parse(taskResult.stdout).data).toMatchObject({
      task: { id: "task_2", title: "Draft CLI contract" },
      source: "mock",
    });

    const taskSearchResult = runCli([
      "tasks",
      "search",
      "--query",
      "cli",
      "--status",
      "inbox",
      "--limit",
      "5",
      "--json",
    ]);
    expect(taskSearchResult.status).toBe(0);
    expect(JSON.parse(taskSearchResult.stdout).data.tasks).toEqual([
      expect.objectContaining({ id: "task_2" }),
    ]);

    const goalSearchResult = runCli([
      "goals",
      "search",
      "--query",
      "agents",
      "--json",
    ]);
    expect(goalSearchResult.status).toBe(0);
    expect(JSON.parse(goalSearchResult.stdout).data.goals).toEqual([
      expect.objectContaining({ id: "goal_2", text: "Automation" }),
    ]);
  });

  it("supports new write and operation commands through the mock CLI surface", () => {
    const goalCreate = runCli([
      "goals",
      "create",
      "--text",
      "Ship mobile beta",
      "--deadline",
      "2026-07-01",
      "--operation-group-id",
      "group-1",
      "--json",
    ]);
    expect(goalCreate.status).toBe(0);
    expect(JSON.parse(goalCreate.stdout).data).toMatchObject({
      action: "goals.create",
      text: "Ship mobile beta",
      operationGroupId: "group-1",
      undoAvailable: true,
    });

    const taskDelete = runCli([
      "tasks",
      "delete",
      "--task-id",
      "task_1",
      "--confirm-task-delete",
      "--json",
    ]);
    expect(taskDelete.status).toBe(0);
    expect(JSON.parse(taskDelete.stdout).data).toMatchObject({
      action: "tasks.delete",
      task: { id: "task_1" },
      undoAvailable: true,
    });

    const linkGoal = runCli([
      "tasks",
      "link-goal",
      "--task-id",
      "task_1",
      "--goal-id",
      "goal_1",
      "--json",
    ]);
    expect(linkGoal.status).toBe(0);
    expect(JSON.parse(linkGoal.stdout).data).toMatchObject({
      action: "tasks.linkGoal",
      task: { id: "task_1" },
      goal: { id: "goal_1" },
    });

    const operationUndo = runCli([
      "operations",
      "undo",
      "--operation-id",
      "op_mock_1",
      "--json",
    ]);
    expect(operationUndo.status).toBe(0);
    expect(JSON.parse(operationUndo.stdout).data).toMatchObject({
      action: "operations.undo",
      operationId: "op_mock_1",
    });
  });

  it("reports local command capabilities without requiring auth", () => {
    const result = runCli(["capabilities", "--json"], {
      PRAVAH_CLI_MOCK: "0",
      PRAVAH_HTTP_URL: "",
      CONVEX_HTTP_API_KEY: "",
      CONVEX_SITE_URL: "",
      VITE_CONVEX_SITE_URL: "",
      CONVEX_URL: "",
      VITE_CONVEX_URL: "",
    });

    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout);
    expect(payload).toMatchObject({
      ok: true,
      version: "v1",
      command: "capabilities",
      data: {
        contractVersion: "v1",
        features: {
          unconditionalJsonErrors: true,
          focusedSearch: true,
          operationLedger: true,
          groupedOperations: true,
        },
        credential: {
          credentialSource: "none",
          scopes: [],
        },
      },
    });
    expect(payload.data.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: "tasks add", kind: "write" }),
        expect.objectContaining({ command: "tasks delete", kind: "write" }),
        expect.objectContaining({ command: "operations undo", kind: "write" }),
        expect.objectContaining({ command: "tasks search", kind: "read" }),
        expect.objectContaining({ command: "agent context", kind: "read" }),
      ])
    );
  });

  it("imports a credential file into local CLI storage", () => {
    const home = mkdtempSync(join(tmpdir(), "pravah-cli-home-"));
    const credentialPath = join(home, "credential.json");
    writeFileSync(
      credentialPath,
      JSON.stringify({
        secret: "pravah_cred_imported",
        label: "Laptop",
        scopes: ["tasks:read"],
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
        "--credential-file",
        "/tmp/unused-credential.json",
        "--json",
      ],
      { PRAVAH_CLI_MOCK: "0" }
    );

    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout).error.message).toContain("exactly one");

    const missingValue = runCli(
      [
        "auth",
        "import",
        "--bootstrap-token",
        "--credential-file",
        "/tmp/unused-credential.json",
        "--json",
      ],
      { PRAVAH_CLI_MOCK: "0" }
    );
    expect(missingValue.status).toBe(1);
    expect(JSON.parse(missingValue.stdout).error.message).toContain(
      "--bootstrap-token requires a value"
    );

    const inlineSecret = runCli(
      ["auth", "import", "--credential-json", "{}", "--json"],
      { PRAVAH_CLI_MOCK: "0" }
    );
    expect(inlineSecret.status).toBe(1);
    expect(JSON.parse(inlineSecret.stdout).error.message).toContain(
      "Unknown option --credential-json"
    );
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
              scopes: ["tasks:read", "tasks:write"],
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
