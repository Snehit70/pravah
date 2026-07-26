/// <reference types="node" />
import { readFileSync } from "node:fs";

export type OptionKind = "flag" | "value";
export type CommandKind = "auth" | "read" | "write";
export interface CommandOptionSpec { readonly name: string; readonly kind: OptionKind; readonly description: string; readonly valueLabel?: string; }
export interface CommandSpec {
  readonly path: readonly [string] | readonly [string, string];
  readonly summary: string;
  readonly kind: CommandKind;
  readonly requiredScopes: readonly string[];
  readonly options: readonly CommandOptionSpec[];
  readonly target?: { readonly label: string; readonly kind: "task" | "goal" | "operation" };
  readonly targetOptional?: boolean;
  readonly supportsDryRun?: boolean;
  readonly generatedIdempotency?: boolean;
  readonly confirmationFlag?: string;
}

const flag = (name: string, description: string): CommandOptionSpec => ({ name, kind: "flag", description });
const value = (name: string, valueLabel: string, description: string): CommandOptionSpec => ({ name, kind: "value", valueLabel, description });
const write = [flag("dry-run", "Validate and preview without applying."), value("idempotency-key", "<key>", "Optional stable retry key."), value("operation-group-id", "<group-id>", "Group related writes for Undo.")];
const taskFields = [value("description", "<text|clear>", "Description."), value("deadline", "<YYYY-MM-DD|clear>", "Local scheduled date."), value("time", "<HH:MM|clear>", "Local scheduled time."), value("priority", "<p1|p2|p3|clear>", "Priority."), value("tags", "<tag,...|clear>", "Comma-separated tags."), value("estimated-minutes", "<minutes|clear>", "Positive estimate.")];
const filters = [value("goal", "<target>", "Exact Goal name or ID."), value("priority", "<p1,p2,p3>", "Any supplied priority."), value("tag", "<tag,...>", "Any supplied tag."), value("status", "<active|inbox|timeline|completed|cancelled>", "Task lifecycle."), value("date", "<YYYY-MM-DD>", "Exact local date."), value("before", "<YYYY-MM-DD>", "Strict upper date bound."), value("after", "<YYYY-MM-DD>", "Strict lower date bound."), flag("all", "Include all active Tasks."), flag("long", "Show expanded human details.")];

export const COMMAND_SPECS: readonly CommandSpec[] = [
  { path: ["capabilities"], summary: "Show the complete v2 machine manifest.", kind: "read", requiredScopes: [], options: [] },
  { path: ["doctor"], summary: "Check local CLI prerequisites without changing state.", kind: "read", requiredScopes: [], options: [] },
  { path: ["inbox"], summary: "Show Inbox Tasks.", kind: "read", requiredScopes: ["tasks:read"], options: [flag("long", "Show expanded details.")] },
  { path: ["today"], summary: "Show Tasks scheduled today.", kind: "read", requiredScopes: ["tasks:read"], options: [flag("long", "Show expanded details.")] },
  { path: ["overdue"], summary: "Show overdue Timeline Tasks.", kind: "read", requiredScopes: ["tasks:read"], options: [flag("long", "Show expanded details.")] },
  { path: ["upcoming"], summary: "Show the next 14 local days.", kind: "read", requiredScopes: ["tasks:read"], options: [flag("long", "Show expanded details.")] },
  { path: ["auth", "login"], summary: "Store a local credential from a bootstrap token.", kind: "auth", requiredScopes: [], options: [value("url", "<http(s)://site>", "Deployment URL."), value("bootstrap-token", "<token>", "Bootstrap token.")] },
  { path: ["auth", "logout"], summary: "Remove this host's local credential only.", kind: "auth", requiredScopes: [], options: [] },
  { path: ["auth", "status"], summary: "Show local credential health and scopes.", kind: "auth", requiredScopes: [], options: [] },
  { path: ["tasks", "list"], summary: "Show the prioritized Task horizon.", kind: "read", requiredScopes: ["tasks:read"], options: filters },
  { path: ["tasks", "show"], summary: "Show one Task by ID or exact title.", kind: "read", requiredScopes: ["tasks:read"], target: { label: "<task>", kind: "task" }, options: [] },
  { path: ["tasks", "add"], summary: "Create a Task.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<title>", kind: "task" }, options: [...taskFields, ...write], supportsDryRun: true, generatedIdempotency: true },
  { path: ["tasks", "edit"], summary: "Edit a Task.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<task>", kind: "task" }, options: [value("title", "<text>", "Replacement title."), ...taskFields, ...write], supportsDryRun: true, generatedIdempotency: true },
  { path: ["tasks", "complete"], summary: "Complete a Task.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<task>", kind: "task" }, options: write, supportsDryRun: true, generatedIdempotency: true },
  { path: ["tasks", "reopen"], summary: "Reopen a completed Task.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<task>", kind: "task" }, options: write, supportsDryRun: true, generatedIdempotency: true },
  { path: ["tasks", "schedule"], summary: "Schedule a Task on a local date.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<task>", kind: "task" }, options: [value("date", "<YYYY-MM-DD>", "New local date."), ...write], supportsDryRun: true, generatedIdempotency: true },
  { path: ["tasks", "unschedule"], summary: "Move a Task to Inbox.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<task>", kind: "task" }, options: write, supportsDryRun: true, generatedIdempotency: true },
  { path: ["tasks", "remove"], summary: "Recoverably remove a Task.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<task>", kind: "task" }, options: [flag("confirm", "Confirm recoverable removal."), ...write], supportsDryRun: true, generatedIdempotency: true, confirmationFlag: "confirm" },
  { path: ["goals", "list"], summary: "Show Goals with linked-Task progress.", kind: "read", requiredScopes: ["tasks:read"], options: [flag("long", "Show expanded details.")] },
  { path: ["goals", "show"], summary: "Show one Goal by ID or exact name.", kind: "read", requiredScopes: ["tasks:read"], target: { label: "<goal>", kind: "goal" }, options: [] },
  { path: ["goals", "add"], summary: "Create a Goal.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<title>", kind: "goal" }, options: [value("description", "<text>", "Description."), value("deadline", "<YYYY-MM-DD>", "Due date."), value("priority", "<p1|p2|p3>", "Priority."), ...write], supportsDryRun: true, generatedIdempotency: true },
  { path: ["goals", "edit"], summary: "Edit a Goal.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<goal>", kind: "goal" }, options: [value("description", "<text|clear>", "Description."), value("deadline", "<YYYY-MM-DD|clear>", "Due date."), value("priority", "<p1|p2|p3|clear>", "Priority."), ...write], supportsDryRun: true, generatedIdempotency: true },
  { path: ["goals", "remove"], summary: "Remove a Goal.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<goal>", kind: "goal" }, options: [flag("confirm", "Confirm removal."), ...write], supportsDryRun: true, generatedIdempotency: true, confirmationFlag: "confirm" },
  { path: ["operations", "list"], summary: "Show recent operations.", kind: "read", requiredScopes: ["tasks:read"], options: [value("limit", "<count>", "Maximum 100; default 20."), value("group", "<group-id>", "Operation group.")] },
  { path: ["operations", "show"], summary: "Show one operation.", kind: "read", requiredScopes: ["tasks:read"], target: { label: "<operation-id>", kind: "operation" }, options: [] },
  { path: ["operations", "undo"], summary: "Undo one operation or a group.", kind: "write", requiredScopes: ["tasks:write"], target: { label: "<operation-id>", kind: "operation" }, targetOptional: true, options: [value("group", "<group-id>", "Undo an operation group."), ...write], supportsDryRun: true, generatedIdempotency: true },
  { path: ["agent", "context"], summary: "Show compact ranked task-planning context.", kind: "read", requiredScopes: ["tasks:read"], options: [] },
];

const globalOptions = [flag("json", "Emit the v2 JSON envelope."), flag("debug", "Append sanitized diagnostics to errors."), flag("no-color", "Disable terminal colour."), flag("help", "Show help."), flag("version", "Show CLI version.")];
export const getCommandName = (spec: CommandSpec) => spec.path.join(" ");
export const getCommandSpec = (command: string) => COMMAND_SPECS.find((spec) => getCommandName(spec) === command) ?? null;
export const getCommandSpecFromPositionals = (positionals: string[]) => COMMAND_SPECS.find((spec) => spec.path.every((part, i) => positionals[i] === part)) ?? null;
export const getAllCommandNames = () => COMMAND_SPECS.map(getCommandName);
export const getCommandOptionKinds = (command: string) => { const spec = getCommandSpec(command); return spec ? Object.fromEntries([...spec.options, ...globalOptions].map((option) => [option.name, option.kind])) : null; };
export const getCommandCapabilities = () => COMMAND_SPECS.map((spec) => ({ command: getCommandName(spec), kind: spec.kind, target: spec.target ?? null, requiredScopes: spec.requiredScopes, options: spec.options, outputModes: ["human", "json"], supportsDryRun: Boolean(spec.supportsDryRun), confirmationFlag: spec.confirmationFlag ?? null, generatedIdempotency: Boolean(spec.generatedIdempotency) }));
export function renderTopLevelHelp() { return ["Pravah CLI v2", "", "Usage: pravah <resource> <verb> [target] [filters]", "", "Commands:", ...COMMAND_SPECS.map((spec) => `  ${getCommandName(spec).padEnd(18)} ${spec.summary}`), "", "Use --json for the machine contract."].join("\n"); }
export function renderCommandHelp(spec: CommandSpec) { const usage = `pravah ${getCommandName(spec)}${spec.target ? ` ${spec.target.label}` : ""}`; return [usage, "", spec.summary, "", "Options:", ...[...spec.options, ...globalOptions].map((option) => `  --${option.name}${option.kind === "value" ? ` ${option.valueLabel}` : ""}  ${option.description}`), "", `Required scopes: ${spec.requiredScopes.join(", ") || "none"}`, `Dry-run: ${spec.supportsDryRun ? "supported" : "not supported"}`, `Idempotency: ${spec.generatedIdempotency ? "generated; --idempotency-key is optional" : "not used"}`].join("\n"); }
export function renderNamespaceHelp(namespace: string) { const entries = COMMAND_SPECS.filter((spec) => spec.path[0] === namespace); return entries.length ? ["Pravah CLI v2", "", ...entries.map((spec) => `${getCommandName(spec)}${spec.target ? ` ${spec.target.label}` : ""} — ${spec.summary}`)].join("\n") : null; }
export const isKnownNamespace = (value: string) => COMMAND_SPECS.some((spec) => spec.path.length === 2 && spec.path[0] === value);
export function suggestClosestCommand(input: string, candidates = getAllCommandNames()) { const value = input.toLowerCase(); return candidates.find((candidate) => candidate.toLowerCase().startsWith(value.slice(0, Math.max(2, value.length - 1)))) ?? null; }
export function readCliPackageVersion() { return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version as string; }
