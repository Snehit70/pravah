import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const entry = resolve(repoRoot, "packages/cli/src/pravah.ts");
const testHome = mkdtempSync(join(tmpdir(), "pravah-cli-home-"));
afterAll(() => rmSync(testHome, { recursive: true, force: true }));
function run(args: string[]) { return spawnSync("bun", ["run", entry, ...args], { cwd: repoRoot, encoding: "utf8", timeout: 30_000, env: { ...process.env, HOME: testHome, XDG_CONFIG_HOME: join(testHome, ".config"), XDG_STATE_HOME: join(testHome, ".local", "state"), PRAVAH_CLI_MOCK: "1" } }); }

describe("Pravah CLI v2", () => {
  it("uses the human-first resource grammar by default", () => {
    const result = run(["tasks", "list"]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Overdue");
    expect(result.stdout).toContain("Inbox:");
    expect(result.stdout).not.toContain('"ok"');
  });

  it("emits the versioned machine envelope only with --json", () => {
    const result = run(["tasks", "show", "Draft CLI contract", "--json"]);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ ok: true, version: "v2", command: "tasks show", data: { task: { id: "task_2" } } });
  });

  it("keeps human errors on stderr and JSON errors structured", () => {
    const human = run(["tasks", "show", "missing"]);
    expect(human.status).toBe(1); expect(human.stderr).toContain("Task not found"); expect(human.stdout).toBe("");
    const machine = run(["tasks", "show", "missing", "--json"]);
    expect(machine.status).toBe(1); expect(JSON.parse(machine.stdout).error.code).toBe("not_found");
  });

  it("accepts exact title targets and rejects incompatible output modes", () => {
    expect(run(["tasks", "show", "Draft CLI contract"]).stdout).toContain("Draft CLI contract");
    const result = run(["tasks", "list", "--long", "--json"]);
    expect(result.status).toBe(1); expect(JSON.parse(result.stdout).error.code).toBe("invalid_option");
  });

  it("requires confirmation for removal and prints an undo receipt", () => {
    const rejected = run(["tasks", "remove", "Draft CLI contract", "--json"]);
    expect(rejected.status).toBe(1);
    const result = run(["tasks", "remove", "Draft CLI contract", "--confirm"]);
    expect(result.status).toBe(0); expect(result.stdout).toContain("Undo: pravah operations undo");
  });

  it("requires exactly one undo target", () => {
    const missing = run(["operations", "undo", "--json"]);
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout).error.code).toBe("invalid_option");
    const both = run(["operations", "undo", "op_1", "--group", "batch", "--json"]);
    expect(both.status).toBe(1);
    expect(JSON.parse(both.stdout).error.code).toBe("invalid_option");
  });

  it("keeps --all active unless an explicit historical status is requested", () => {
    const active = JSON.parse(run(["tasks", "list", "--all", "--json"]).stdout).data.tasks;
    expect(active.every((task: { status: string }) => ["inbox", "timeline"].includes(task.status))).toBe(true);
    const completed = JSON.parse(run(["tasks", "list", "--status", "completed", "--json"]).stdout).data.tasks;
    expect(completed.every((task: { status: string }) => task.status === "completed")).toBe(true);
  });

  it("links and unlinks tasks to goals with dry-run previews", () => {
    const preview = JSON.parse(run(["tasks", "link", "Draft CLI contract", "--goal", "Planning", "--dry-run", "--json"]).stdout);
    expect(preview).toMatchObject({ ok: true, data: { action: "tasks.link", goal: { id: "goal_1" } } });
    const applied = JSON.parse(run(["tasks", "link", "Draft CLI contract", "--goal", "Planning", "--json"]).stdout);
    expect(applied).toMatchObject({ ok: true, data: { action: "tasks.link", operation: { undoAvailable: true } } });
    const unlinked = JSON.parse(run(["tasks", "unlink", "Draft CLI contract", "--json"]).stdout);
    expect(unlinked).toMatchObject({ ok: true, data: { action: "tasks.unlink" } });
  });

  it("creates tasks directly linked to a goal and rejects a missing link target", () => {
    const added = JSON.parse(run(["tasks", "add", "Goal task", "--goal", "Automation", "--json"]).stdout);
    expect(added).toMatchObject({ ok: true, data: { action: "tasks.add", goal: { id: "goal_2" } } });
    const missing = run(["tasks", "link", "Draft CLI contract", "--json"]);
    expect(missing.status).toBe(1);
    expect(JSON.parse(missing.stdout).error.code).toBe("validation_failed");
  });

  it("publishes link commands in the v2 capabilities manifest", () => {
    const result = run(["capabilities", "--json"]);
    const commands = JSON.parse(result.stdout).data.commands;
    expect(commands.map((command: { command: string }) => command.command)).toEqual(expect.arrayContaining(["tasks link", "tasks unlink"]));
  });
  it("publishes a complete v2 capabilities manifest", () => {
    const result = run(["capabilities", "--json"]);
    const commands = JSON.parse(result.stdout).data.commands;
    expect(commands.map((command: { command: string }) => command.command)).toEqual(expect.arrayContaining(["tasks show", "goals remove", "operations undo", "auth logout", "doctor"]));
    expect(commands.map((command: { command: string }) => command.command)).not.toContain("sync status");
  });

  it("makes agent context compact and task-only", () => {
    const result = run(["agent", "context", "--json"]);
    const data = JSON.parse(result.stdout).data;
    expect(data).toMatchObject({ overdue: { tasks: expect.any(Array) }, todayTasks: { tasks: expect.any(Array) }, next: { tasks: expect.any(Array) }, inbox: { count: expect.any(Number) } });
    expect(data.reviewQueueSummary).toBeUndefined();
  });

  it("logs out locally without needing remote access", () => {
    const result = run(["auth", "logout", "--json"]);
    expect(JSON.parse(result.stdout).data).toEqual({ loggedOut: true, localOnly: true });
  });
});
