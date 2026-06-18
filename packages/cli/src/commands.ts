/// <reference types="node" />
import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { readOption } from "./args";
import {
  COMMAND_SPECS,
  getCommandCapabilities,
  getCommandName,
  getCommandSpec,
  getCommandSpecFromPositionals,
  getNamespaceSpecs,
  isKnownNamespace,
  readCliPackageVersion,
  renderCommandHelp,
  renderNamespaceHelp,
  renderTopLevelHelp,
  suggestClosestCommand,
} from "./commandSpec";
import {
  loadStoredCredential,
  parseCredentialImport,
  saveStoredCredential,
} from "./authStore";
import { executeDryRun, validateCommandArgs } from "./commandUtils";
import { executeLiveCommand } from "./liveCommands";
import {
  createCliAuthClient,
  createLiveClient,
  resolveCliHttpUrl,
} from "./liveClient";
import { executeMockCommand } from "./mockCommands";
import { mockCredential } from "./mockData";
import { CLI_CONTRACT_VERSION, type CliTextResult, type CommandContext, type ParsedArgs } from "./types";

function isMockEnabled() {
  return process.env.PRAVAH_CLI_MOCK === "1";
}

function buildTextResult(text: string): CliTextResult {
  return { kind: "text", text };
}

export function isCliTextResult(value: unknown): value is CliTextResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "text" in value &&
    (value as { kind?: unknown }).kind === "text" &&
    typeof (value as { text?: unknown }).text === "string"
  );
}

function unknownCommandError(input: string, candidates?: readonly string[]) {
  const suggestion = suggestClosestCommand(input, candidates);
  return suggestion
    ? new Error(`Unknown command: ${input}. Did you mean \`${suggestion}\`?`)
    : new Error(`Unknown command: ${input}`);
}

function normalizeSetupUrl(value: string) {
  const normalized = value.trim().replace(/\/+$/, "");
  if (!normalized) {
    throw new Error("Setup requires a deployment URL");
  }
  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("invalid");
    }
    return normalized;
  } catch {
    throw new Error("Setup requires a valid http(s) deployment URL");
  }
}

async function exchangeBootstrapCredential(bootstrapToken: string, siteUrl?: string) {
  const authClient = createCliAuthClient({
    ...process.env,
    PRAVAH_HTTP_URL: siteUrl ?? process.env.PRAVAH_HTTP_URL,
  });
  if (!authClient) {
    throw new Error(
      "CLI HTTP URL is not configured. Set PRAVAH_HTTP_URL or CONVEX_SITE_URL before importing a bootstrap token."
    );
  }
  return authClient.exchangeBootstrapToken(bootstrapToken);
}

function resolveHelpOutput(args: ParsedArgs): CliTextResult {
  if (args.positionals.length === 0) {
    return buildTextResult(renderTopLevelHelp());
  }

  if (args.positionals.length === 1) {
    const [first] = args.positionals;
    if (isKnownNamespace(first)) {
      return buildTextResult(renderNamespaceHelp(first) ?? renderTopLevelHelp());
    }
    const spec = getCommandSpecFromPositionals([first]);
    if (spec) {
      return buildTextResult(renderCommandHelp(spec));
    }
    throw unknownCommandError(first, [
      ...getNamespaceSpecs().map((spec) => spec.name),
      ...COMMAND_SPECS.filter((spec) => spec.path.length === 1).map(getCommandName),
    ]);
  }

  const command = args.positionals.slice(0, 2).join(" ");
  const spec = getCommandSpec(command);
  if (!spec) {
    throw unknownCommandError(command, COMMAND_SPECS.map(getCommandName));
  }
  if (args.positionals.length !== spec.path.length) {
    throw new Error(`Unexpected positional arguments for ${command}`);
  }
  return buildTextResult(renderCommandHelp(spec));
}

function resolveCommand(args: ParsedArgs) {
  if (args.positionals.length === 0) {
    return null;
  }
  if (args.positionals.length === 1) {
    const [first] = args.positionals;
    const spec = getCommandSpecFromPositionals([first]);
    if (spec) return getCommandName(spec);
    if (isKnownNamespace(first)) {
      throw new Error("Missing command name");
    }
    throw unknownCommandError(first, [
      ...getNamespaceSpecs().map((spec) => spec.name),
      ...COMMAND_SPECS.filter((spec) => spec.path.length === 1).map(getCommandName),
    ]);
  }

  const command = args.positionals.slice(0, 2).join(" ");
  const spec = getCommandSpec(command);
  if (!spec) {
    throw unknownCommandError(command, COMMAND_SPECS.map(getCommandName));
  }
  return command;
}

async function importCredential(args: ParsedArgs) {
  const credentialFile = readOption(args.options, "credential-file");
  const bootstrapToken = readOption(args.options, "bootstrap-token");
  const sources = [
    bootstrapToken ? "bootstrap-token" : null,
    credentialFile ? "credential-file" : null,
  ].filter((source): source is string => source !== null);
  if (sources.length !== 1) {
    throw new Error(
      "Provide exactly one of --bootstrap-token or --credential-file"
    );
  }

  let imported;
  if (bootstrapToken) {
    imported = await exchangeBootstrapCredential(bootstrapToken);
  } else if (credentialFile) {
    imported = parseCredentialImport(readFileSync(credentialFile, "utf8"));
  } else {
    throw new Error("Credential import source is missing");
  }
  saveStoredCredential(imported);
  return {
    imported: true,
    credentialLabel: imported.label,
    scopes: imported.scopes,
    ownerTokenIdentifier: imported.ownerTokenIdentifier,
    siteUrl: imported.siteUrl ?? null,
    source: sources[0],
  };
}

function getCredentialContext() {
  const stored = loadStoredCredential();
  if (stored) return { credential: stored, source: "local" as const };
  if (isMockEnabled()) {
    return {
      credential: {
        secret: "mock",
        label: mockCredential.credentialLabel,
        scopes: mockCredential.scopes,
        ownerTokenIdentifier: "mock-user",
        userId: mockCredential.userId,
        email: mockCredential.email,
        siteUrl: mockCredential.siteUrl,
      },
      source: "mock" as const,
    };
  }
  throw new Error(
    "Pravah CLI is not authenticated. Import a bootstrap token with `pravah auth import --bootstrap-token <token> --json`."
  );
}

function buildWhoamiPayload() {
  const { credential, source } = getCredentialContext();
  return {
    userId: credential.userId ?? credential.ownerTokenIdentifier,
    email: credential.email ?? null,
    credentialLabel: credential.label,
    siteUrl: credential.siteUrl ?? resolveCliHttpUrl(process.env) ?? null,
    ownerTokenIdentifier: credential.ownerTokenIdentifier,
    source,
  };
}

async function runSetupFlow(args: ParsedArgs) {
  const providedUrl = readOption(args.options, "url");
  const providedBootstrapToken = readOption(args.options, "bootstrap-token");
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const siteUrl = normalizeSetupUrl(
      providedUrl ?? await rl.question("Deployment URL: ")
    );
    const bootstrapToken = (providedBootstrapToken ?? await rl.question("Bootstrap token: ")).trim();
    if (!bootstrapToken) {
      throw new Error("Setup requires a bootstrap token");
    }

    const imported = await exchangeBootstrapCredential(bootstrapToken, siteUrl);
    saveStoredCredential({
      ...imported,
      siteUrl,
    });

    return {
      configured: true,
      ...buildWhoamiPayload(),
    };
  } finally {
    rl.close();
  }
}

function executeAuthCommand(command: string, args: ParsedArgs) {
  if (command === "auth import") {
    return importCredential(args);
  }
  if (command === "auth login" || command === "setup") {
    return runSetupFlow(args);
  }
  if (command === "auth whoami") {
    return buildWhoamiPayload();
  }
  if (command === "auth list-scopes") {
    const { credential, source } = getCredentialContext();
    return {
      scopes: credential.scopes,
      source,
    };
  }
  return null;
}

function executeCapabilitiesCommand() {
  const credentialContext = (() => {
    try {
      const stored = loadStoredCredential();
      if (stored) return { scopes: stored.scopes, credentialSource: "local" };
    } catch {
      return { scopes: [], credentialSource: "invalid" };
    }
    if (isMockEnabled()) {
      return { scopes: mockCredential.scopes, credentialSource: "mock" };
    }
    return { scopes: [], credentialSource: "none" };
  })();

  return {
    contractVersion: CLI_CONTRACT_VERSION,
    commands: getCommandCapabilities(),
    features: {
      unconditionalJsonErrors: true,
      operationLedger: true,
      groupedOperations: true,
      focusedSearch: true,
    },
    credential: credentialContext,
    source: "local",
  };
}

export async function executeCommand(context: CommandContext, args: ParsedArgs) {
  if (args.options.version === true) {
    return buildTextResult(readCliPackageVersion());
  }

  if (args.options.help === true || args.positionals.length === 0) {
    return resolveHelpOutput(args);
  }

  const command = resolveCommand(args);
  if (!command) {
    return buildTextResult(renderTopLevelHelp());
  }
  validateCommandArgs(command, args);

  if (command === "capabilities") {
    return executeCapabilitiesCommand();
  }

  const authResult = executeAuthCommand(command, args);
  if (authResult) {
    return authResult;
  }

  const dryRun = executeDryRun(command, args);
  if (dryRun) {
    return dryRun;
  }

  if (isMockEnabled()) {
    return executeMockCommand(command, args);
  }

  const client = createLiveClient(process.env);
  if (!client) {
    throw new Error(
      "Pravah CLI is not authenticated or its HTTP URL is missing. Import a bootstrap token, or set PRAVAH_HTTP_URL and CONVEX_HTTP_API_KEY."
    );
  }

  const result = await executeLiveCommand(client, command, args);
  if (result === null) {
    throw new Error(`Unknown command: ${context.command}`);
  }
  return result;
}
