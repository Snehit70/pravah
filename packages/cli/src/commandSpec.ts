/// <reference types="node" />
import { readFileSync } from "node:fs";

export type OptionKind = "flag" | "value";
export type CommandKind = "auth" | "read" | "write";

export interface CommandOptionSpec {
  readonly name: string;
  readonly kind: OptionKind;
  readonly description: string;
  readonly valueLabel?: string;
}

export interface CommandSpec {
  readonly path: readonly [string] | readonly [string, string];
  readonly summary: string;
  readonly description: string;
  readonly kind: CommandKind;
  readonly requiredScopes: readonly string[];
  readonly options: readonly CommandOptionSpec[];
  readonly supportsDryRun?: boolean;
  readonly requiresIdempotencyKey?: boolean;
  readonly confirmationFlag?: string;
}

interface NamespaceSpec {
  readonly name: string;
  readonly summary: string;
}

const GLOBAL_COMMAND_OPTIONS: readonly CommandOptionSpec[] = [
  { name: "json", kind: "flag", description: "Emit the JSON envelope for command results." },
];

const HELP_COMMAND_OPTIONS: readonly CommandOptionSpec[] = [
  { name: "help", kind: "flag", description: "Show help for this command." },
];

const WRITE_COMMAND_OPTIONS: readonly CommandOptionSpec[] = [
  { name: "dry-run", kind: "flag", description: "Validate and preview the write without applying it." },
  { name: "idempotency-key", kind: "value", valueLabel: "<key>", description: "Override the generated idempotency key for this write." },
  { name: "operation-group-id", kind: "value", valueLabel: "<group-id>", description: "Associate this write with an operation group for later undo/listing." },
];

const TASK_ID_WRITE_OPTIONS: readonly CommandOptionSpec[] = [
  { name: "task-id", kind: "value", valueLabel: "<task-id>", description: "Target task id." },
  ...WRITE_COMMAND_OPTIONS,
];

const NAMESPACE_SPECS: readonly NamespaceSpec[] = [
  { name: "auth", summary: "Import credentials and inspect local CLI auth state." },
  { name: "tasks", summary: "Read and mutate tasks from the timeline workflow." },
  { name: "goals", summary: "Read and mutate goals and their planning metadata." },
  { name: "operations", summary: "Inspect and undo prior automation writes." },
  { name: "review", summary: "Read the review queue surfaced by the mobile app." },
  { name: "sync", summary: "Inspect sync provider health and status." },
  { name: "agent", summary: "Fetch bounded agent-oriented context and focused task reads." },
];

export const COMMAND_SPECS: readonly CommandSpec[] = [
  {
    path: ["capabilities"],
    summary: "Report the CLI command contract and feature flags.",
    description: "Emit a machine-readable description of the supported command surface without requiring authentication.",
    kind: "read",
    requiredScopes: [],
    options: [],
  },
  {
    path: ["auth", "import"],
    summary: "Import a bootstrap token or credential file into local CLI storage.",
    description: "Store one CLI credential locally by exchanging a bootstrap token or reading a credential export file.",
    kind: "auth",
    requiredScopes: [],
    options: [
      { name: "bootstrap-token", kind: "value", valueLabel: "<token>", description: "Bootstrap token to exchange for a stored CLI credential." },
      { name: "credential-file", kind: "value", valueLabel: "<path>", description: "Path to an exported credential JSON file." },
    ],
  },
  {
    path: ["auth", "whoami"],
    summary: "Show the currently stored credential identity.",
    description: "Print the credential label, user identity, resolved site URL, and credential source.",
    kind: "auth",
    requiredScopes: [],
    options: [],
  },
  {
    path: ["auth", "list-scopes"],
    summary: "Show the scopes granted to the current CLI credential.",
    description: "List the scopes carried by the current stored or mock credential.",
    kind: "auth",
    requiredScopes: [],
    options: [],
  },
  {
    path: ["tasks", "list"],
    summary: "List tasks with optional status and date filters.",
    description: "Return tasks filtered by task status and an exact scheduled date when provided.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [
      { name: "status", kind: "value", valueLabel: "<status>", description: "Filter by inbox, timeline, completed, cancelled, or scheduled." },
      { name: "date", kind: "value", valueLabel: "<YYYY-MM-DD>", description: "Filter by a specific scheduled date." },
    ],
  },
  {
    path: ["tasks", "get"],
    summary: "Fetch one task by id.",
    description: "Return the task matching the provided task id.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [
      { name: "task-id", kind: "value", valueLabel: "<task-id>", description: "Task id to fetch." },
    ],
  },
  {
    path: ["tasks", "search"],
    summary: "Search tasks by query with optional status filtering.",
    description: "Return tasks whose title or description matches the provided query.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [
      { name: "query", kind: "value", valueLabel: "<text>", description: "Case-insensitive task search query." },
      { name: "status", kind: "value", valueLabel: "<status>", description: "Optional status filter applied before matching." },
      { name: "limit", kind: "value", valueLabel: "<count>", description: "Maximum number of matches to return." },
    ],
  },
  {
    path: ["tasks", "inbox"],
    summary: "List inbox tasks only.",
    description: "Return only tasks currently living in the inbox.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [],
  },
  {
    path: ["tasks", "timeline"],
    summary: "Group scheduled tasks by date up to an end date.",
    description: "Return timeline tasks bucketed by date through the provided end date.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [
      { name: "end-date", kind: "value", valueLabel: "<YYYY-MM-DD>", description: "Last date to include in the returned timeline." },
    ],
  },
  {
    path: ["tasks", "add"],
    summary: "Create a new task.",
    description: "Create a task with optional metadata such as description, deadline, priority, tags, and estimated minutes.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: [
      { name: "title", kind: "value", valueLabel: "<title>", description: "Task title." },
      { name: "description", kind: "value", valueLabel: "<text>", description: "Optional task description." },
      { name: "deadline", kind: "value", valueLabel: "<YYYY-MM-DD>", description: "Optional scheduled date for the task." },
      { name: "priority", kind: "value", valueLabel: "<p1|p2|p3>", description: "Optional task priority." },
      { name: "tags", kind: "value", valueLabel: "<tag1,tag2>", description: "Comma-separated task tags." },
      { name: "estimated-minutes", kind: "value", valueLabel: "<minutes>", description: "Positive integer estimate for task duration." },
      ...WRITE_COMMAND_OPTIONS,
    ],
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["tasks", "move"],
    summary: "Move a task to another scheduled date.",
    description: "Update the scheduled date for one task.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: [
      { name: "task-id", kind: "value", valueLabel: "<task-id>", description: "Task to move." },
      { name: "target-date", kind: "value", valueLabel: "<YYYY-MM-DD>", description: "New scheduled date for the task." },
      ...WRITE_COMMAND_OPTIONS,
    ],
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["tasks", "update"],
    summary: "Update selected fields on an existing task.",
    description: "Patch one task's title, description, deadline, priority, tags, or estimate. Clearable fields accept `clear`.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: [
      { name: "task-id", kind: "value", valueLabel: "<task-id>", description: "Task to update." },
      { name: "title", kind: "value", valueLabel: "<title>", description: "Replacement task title." },
      { name: "description", kind: "value", valueLabel: "<text|clear>", description: "Replacement description, or `clear`." },
      { name: "deadline", kind: "value", valueLabel: "<YYYY-MM-DD|clear>", description: "Replacement deadline, or `clear`." },
      { name: "priority", kind: "value", valueLabel: "<p1|p2|p3|clear>", description: "Replacement priority, or `clear`." },
      { name: "tags", kind: "value", valueLabel: "<tag1,tag2|clear>", description: "Replacement tag list, or `clear`." },
      { name: "estimated-minutes", kind: "value", valueLabel: "<minutes|clear>", description: "Replacement estimate, or `clear`." },
      ...WRITE_COMMAND_OPTIONS,
    ],
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["tasks", "delete"],
    summary: "Soft-delete a task with confirmation.",
    description: "Delete a task through the operation ledger so it can be undone within the retention window.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: [
      { name: "task-id", kind: "value", valueLabel: "<task-id>", description: "Task to delete." },
      { name: "confirm-task-delete", kind: "flag", description: "Required confirmation flag for task deletion." },
      ...WRITE_COMMAND_OPTIONS,
    ],
    supportsDryRun: true,
    requiresIdempotencyKey: true,
    confirmationFlag: "confirm-task-delete",
  },
  {
    path: ["tasks", "link-goal"],
    summary: "Link a task to a goal.",
    description: "Attach one task to a goal via the Goal Link relation.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: [
      ...TASK_ID_WRITE_OPTIONS,
      { name: "goal-id", kind: "value", valueLabel: "<goal-id>", description: "Goal to link to the task." },
    ],
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["tasks", "unlink-goal"],
    summary: "Remove a task's goal link.",
    description: "Detach the current goal link from a task.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: TASK_ID_WRITE_OPTIONS,
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["tasks", "complete"],
    summary: "Mark a task as completed.",
    description: "Complete one task through the automation surface.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: TASK_ID_WRITE_OPTIONS,
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["tasks", "reopen"],
    summary: "Reopen a completed task.",
    description: "Move a completed task back into its active state.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: TASK_ID_WRITE_OPTIONS,
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["tasks", "unschedule"],
    summary: "Remove a task's scheduled date.",
    description: "Move a scheduled task back into the inbox.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: TASK_ID_WRITE_OPTIONS,
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["goals", "list"],
    summary: "List goals and their current task links.",
    description: "Return all goals plus the current task-to-goal link mapping.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [],
  },
  {
    path: ["goals", "get"],
    summary: "Fetch one goal by id.",
    description: "Return the goal matching the provided goal id.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [
      { name: "goal-id", kind: "value", valueLabel: "<goal-id>", description: "Goal id to fetch." },
    ],
  },
  {
    path: ["goals", "search"],
    summary: "Search goals by query.",
    description: "Return goals whose text or description matches the provided query.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [
      { name: "query", kind: "value", valueLabel: "<text>", description: "Case-insensitive goal search query." },
      { name: "limit", kind: "value", valueLabel: "<count>", description: "Maximum number of matches to return." },
    ],
  },
  {
    path: ["goals", "create"],
    summary: "Create a new goal.",
    description: "Create a goal with optional description, deadline, and priority metadata.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: [
      { name: "goal-id", kind: "value", valueLabel: "<client-id>", description: "Optional client-provided goal id." },
      { name: "text", kind: "value", valueLabel: "<text>", description: "Goal title or text." },
      { name: "description", kind: "value", valueLabel: "<text>", description: "Optional goal description." },
      { name: "deadline", kind: "value", valueLabel: "<YYYY-MM-DD>", description: "Optional goal deadline." },
      { name: "priority", kind: "value", valueLabel: "<p1|p2|p3>", description: "Optional goal priority." },
      ...WRITE_COMMAND_OPTIONS,
    ],
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["goals", "update"],
    summary: "Update selected fields on an existing goal.",
    description: "Patch a goal's description, deadline, or priority. Clearable fields accept `clear`.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: [
      { name: "goal-id", kind: "value", valueLabel: "<goal-id>", description: "Goal to update." },
      { name: "description", kind: "value", valueLabel: "<text|clear>", description: "Replacement description, or `clear`." },
      { name: "deadline", kind: "value", valueLabel: "<YYYY-MM-DD|clear>", description: "Replacement deadline, or `clear`." },
      { name: "priority", kind: "value", valueLabel: "<p1|p2|p3|clear>", description: "Replacement priority, or `clear`." },
      ...WRITE_COMMAND_OPTIONS,
    ],
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["goals", "delete"],
    summary: "Soft-delete a goal with confirmation.",
    description: "Delete a goal through the operation ledger so it can be undone within the retention window.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: [
      { name: "goal-id", kind: "value", valueLabel: "<goal-id>", description: "Goal to delete." },
      { name: "confirm-goal-delete", kind: "flag", description: "Required confirmation flag for goal deletion." },
      ...WRITE_COMMAND_OPTIONS,
    ],
    supportsDryRun: true,
    requiresIdempotencyKey: true,
    confirmationFlag: "confirm-goal-delete",
  },
  {
    path: ["operations", "list"],
    summary: "List recorded automation operations.",
    description: "Return recent operation ledger entries, optionally filtered by operation group.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [
      { name: "limit", kind: "value", valueLabel: "<count>", description: "Maximum number of operations to return." },
      { name: "operation-group-id", kind: "value", valueLabel: "<group-id>", description: "Filter operations by operation group id." },
    ],
  },
  {
    path: ["operations", "get"],
    summary: "Fetch one operation ledger entry.",
    description: "Return one operation ledger entry by operation id.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [
      { name: "operation-id", kind: "value", valueLabel: "<operation-id>", description: "Operation id to fetch." },
    ],
  },
  {
    path: ["operations", "undo"],
    summary: "Undo a prior operation or grouped operation.",
    description: "Reverse one operation or one recorded operation group through the ledger-based undo surface.",
    kind: "write",
    requiredScopes: ["tasks:write"],
    options: [
      { name: "operation-id", kind: "value", valueLabel: "<operation-id>", description: "Specific operation to undo." },
      { name: "operation-group-id", kind: "value", valueLabel: "<group-id>", description: "Operation group id to undo as a batch." },
      ...WRITE_COMMAND_OPTIONS,
    ],
    supportsDryRun: true,
    requiresIdempotencyKey: true,
  },
  {
    path: ["review", "list"],
    summary: "List review queue items.",
    description: "Return review items with optional status filtering and limits.",
    kind: "read",
    requiredScopes: ["review:read"],
    options: [
      { name: "status", kind: "value", valueLabel: "<status>", description: "Filter by pending, approved, or rejected." },
      { name: "limit", kind: "value", valueLabel: "<count>", description: "Maximum number of review items to return." },
    ],
  },
  {
    path: ["sync", "status"],
    summary: "Show sync provider status.",
    description: "Return the health and connection status for the configured sync provider.",
    kind: "read",
    requiredScopes: ["sync:read"],
    options: [
      { name: "provider", kind: "value", valueLabel: "<provider>", description: "Optional provider override." },
    ],
  },
  {
    path: ["agent", "context"],
    summary: "Fetch bounded agent context.",
    description: "Return the bounded context bundle used by automation agents.",
    kind: "read",
    requiredScopes: ["tasks:read", "review:read", "sync:read"],
    options: [],
  },
  {
    path: ["agent", "task"],
    summary: "Fetch one task in the agent-focused surface.",
    description: "Return one task by id from the agent-focused interface.",
    kind: "read",
    requiredScopes: ["tasks:read"],
    options: [
      { name: "task-id", kind: "value", valueLabel: "<task-id>", description: "Task id to fetch." },
    ],
  },
] as const;

const PACKAGE_VERSION = (() => {
  const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  const parsed = JSON.parse(raw) as { version?: unknown };
  return typeof parsed.version === "string" ? parsed.version : "0.0.0";
})();

function commandWidth(commands: readonly string[]) {
  return commands.reduce((max, command) => Math.max(max, command.length), 0);
}

function optionLabel(option: CommandOptionSpec) {
  return option.kind === "value"
    ? `--${option.name} ${option.valueLabel ?? "<value>"}`
    : `--${option.name}`;
}

function optionWidth(options: readonly CommandOptionSpec[]) {
  return options.reduce((max, option) => Math.max(max, optionLabel(option).length), 0);
}

function padRight(value: string, width: number) {
  return width > value.length ? `${value}${" ".repeat(width - value.length)}` : value;
}

function levenshteinDistance(left: string, right: string) {
  const rows = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0)
  );

  for (let i = 0; i <= left.length; i += 1) rows[i][0] = i;
  for (let j = 0; j <= right.length; j += 1) rows[0][j] = j;

  for (let i = 1; i <= left.length; i += 1) {
    for (let j = 1; j <= right.length; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      rows[i][j] = Math.min(
        rows[i - 1][j] + 1,
        rows[i][j - 1] + 1,
        rows[i - 1][j - 1] + cost
      );
    }
  }

  return rows[left.length][right.length];
}

export function readCliPackageVersion() {
  return PACKAGE_VERSION;
}

export function getCommandName(spec: CommandSpec) {
  return spec.path.join(" ");
}

export function getGlobalCommandOptions() {
  return GLOBAL_COMMAND_OPTIONS;
}

export function getHelpCommandOptions() {
  return HELP_COMMAND_OPTIONS;
}

export function getNamespaceSpecs() {
  return NAMESPACE_SPECS;
}

export function isKnownNamespace(namespace: string) {
  return NAMESPACE_SPECS.some((spec) => spec.name === namespace);
}

export function getCommandSpec(command: string) {
  return COMMAND_SPECS.find((spec) => getCommandName(spec) === command) ?? null;
}

export function getCommandSpecFromPositionals(positionals: readonly string[]) {
  return COMMAND_SPECS.find(
    (spec) =>
      spec.path.length === positionals.length &&
      spec.path.every((part, index) => part === positionals[index])
  ) ?? null;
}

export function listNamespaceCommands(namespace: string) {
  return COMMAND_SPECS.filter(
    (spec): spec is CommandSpec & { path: readonly [string, string] } =>
      spec.path.length === 2 && spec.path[0] === namespace
  );
}

export function getAllCommandNames() {
  return COMMAND_SPECS.map(getCommandName);
}

export function getCommandOptionKinds(command: string) {
  const spec = getCommandSpec(command);
  if (!spec) return null;
  return Object.fromEntries(
    [...spec.options, ...GLOBAL_COMMAND_OPTIONS].map((option) => [option.name, option.kind])
  ) as Record<string, OptionKind>;
}

export function getCommandCapabilities() {
  return COMMAND_SPECS.map((spec) => ({
    command: getCommandName(spec),
    kind: spec.kind,
    description: spec.summary,
    requiredScopes: [...spec.requiredScopes],
    supportsDryRun: spec.supportsDryRun === true,
    requiresIdempotencyKey: spec.requiresIdempotencyKey === true,
    requiresConfirmation: Boolean(spec.confirmationFlag),
  }));
}

export function renderTopLevelHelp() {
  const namespaceWidth = commandWidth(NAMESPACE_SPECS.map((spec) => spec.name));
  const globalCommands = COMMAND_SPECS.filter((spec) => spec.path.length === 1);
  const globalWidth = commandWidth(globalCommands.map(getCommandName));

  const namespaceLines = NAMESPACE_SPECS.map(
    (spec) => `  ${padRight(spec.name, namespaceWidth)}  ${spec.summary}`
  );
  const globalLines = globalCommands.map(
    (spec) => `  ${padRight(getCommandName(spec), globalWidth)}  ${spec.summary}`
  );

  return [
    "pravah CLI",
    "",
    "Usage:",
    "  pravah <namespace> <command> [options] [--json]",
    "  pravah <namespace> --help",
    "  pravah <namespace> <command> --help",
    "  pravah --version",
    "",
    "Namespaces:",
    ...namespaceLines,
    "",
    "Global commands:",
    ...globalLines,
  ].join("\n");
}

export function renderNamespaceHelp(namespace: string) {
  const namespaceSpec = NAMESPACE_SPECS.find((spec) => spec.name === namespace);
  if (!namespaceSpec) return null;
  const commands = listNamespaceCommands(namespace);
  const width = commandWidth(commands.map((spec) => spec.path[1]));

  return [
    `pravah ${namespace}`,
    "",
    namespaceSpec.summary,
    "",
    "Usage:",
    `  pravah ${namespace} <command> [options] [--json]`,
    "",
    "Commands:",
    ...commands.map(
      (spec) => `  ${padRight(spec.path[1], width)}  ${spec.summary}`
    ),
  ].join("\n");
}

export function renderCommandHelp(spec: CommandSpec) {
  const commandName = getCommandName(spec);
  const allOptions = [...spec.options, ...GLOBAL_COMMAND_OPTIONS, ...HELP_COMMAND_OPTIONS];
  const width = optionWidth(allOptions);

  const optionLines =
    allOptions.length === 0
      ? ["  (none)"]
      : allOptions.map(
          (option) =>
            `  ${padRight(optionLabel(option), width)}  ${option.description}`
        );

  return [
    `pravah ${commandName}`,
    "",
    spec.description,
    "",
    "Usage:",
    `  pravah ${commandName} [options]`,
    "",
    "Options:",
    ...optionLines,
    "",
    `Required scopes: ${spec.requiredScopes.length > 0 ? spec.requiredScopes.join(", ") : "none"}`,
    `Dry-run: ${spec.supportsDryRun ? "supported" : "not supported"}`,
    `Idempotency key: ${spec.requiresIdempotencyKey ? "supported" : "not used"}`,
    `Confirmation: ${spec.confirmationFlag ? `required via --${spec.confirmationFlag}` : "not required"}`,
  ].join("\n");
}

export function suggestClosestCommand(input: string, candidates?: readonly string[]) {
  const normalizedInput = input.trim().toLowerCase();
  if (!normalizedInput) return null;
  const pool = candidates ?? [...NAMESPACE_SPECS.map((spec) => spec.name), ...getAllCommandNames()];
  let best: { candidate: string; distance: number } | null = null;

  for (const candidate of pool) {
    const distance = levenshteinDistance(normalizedInput, candidate.toLowerCase());
    if (!best || distance < best.distance) {
      best = { candidate, distance };
    }
  }

  if (!best) return null;
  const threshold = Math.max(2, Math.floor(best.candidate.length / 3));
  return best.distance <= threshold ? best.candidate : null;
}
