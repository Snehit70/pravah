/// <reference types="node" />
import { readFileSync } from "node:fs";
import { readOption } from "./args";
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
import type { CommandContext, ParsedArgs } from "./types";

function isMockEnabled() {
  return process.env.PRAVAH_CLI_MOCK === "1";
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
    const authClient = createCliAuthClient(process.env);
    if (!authClient) {
      throw new Error(
        "CLI HTTP URL is not configured. Set PRAVAH_HTTP_URL or CONVEX_SITE_URL before importing a bootstrap token."
      );
    }
    imported = await authClient.exchangeBootstrapToken(bootstrapToken);
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

function executeAuthCommand(command: string, args: ParsedArgs) {
  if (command === "auth import") {
    return importCredential(args);
  }
  if (command === "auth whoami") {
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
    contractVersion: "v1",
    commands: [
      { command: "auth import", kind: "auth", requiredScopes: [] },
      { command: "auth whoami", kind: "auth", requiredScopes: [] },
      { command: "auth list-scopes", kind: "auth", requiredScopes: [] },
      { command: "capabilities", kind: "read", requiredScopes: [] },
      { command: "tasks list", kind: "read", requiredScopes: ["tasks:read"] },
      { command: "tasks get", kind: "read", requiredScopes: ["tasks:read"] },
      { command: "tasks search", kind: "read", requiredScopes: ["tasks:read"] },
      { command: "tasks inbox", kind: "read", requiredScopes: ["tasks:read"] },
      { command: "tasks timeline", kind: "read", requiredScopes: ["tasks:read"] },
      { command: "goals list", kind: "read", requiredScopes: ["tasks:read"] },
      { command: "goals get", kind: "read", requiredScopes: ["tasks:read"] },
      { command: "goals search", kind: "read", requiredScopes: ["tasks:read"] },
      { command: "operations list", kind: "read", requiredScopes: ["tasks:read"] },
      { command: "operations get", kind: "read", requiredScopes: ["tasks:read"] },
      { command: "review list", kind: "read", requiredScopes: ["review:read"] },
      { command: "sync status", kind: "read", requiredScopes: ["sync:read"] },
      {
        command: "agent context",
        kind: "read",
        requiredScopes: ["tasks:read", "review:read", "sync:read"],
      },
      { command: "agent task", kind: "read", requiredScopes: ["tasks:read"] },
      {
        command: "goals create",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
      {
        command: "goals update",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
      {
        command: "goals delete",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        requiresConfirmation: true,
        supportsDryRun: true,
      },
      {
        command: "tasks add",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
      {
        command: "tasks move",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
      {
        command: "tasks update",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
      {
        command: "tasks delete",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        requiresConfirmation: true,
        supportsDryRun: true,
      },
      {
        command: "tasks link-goal",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
      {
        command: "tasks unlink-goal",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
      {
        command: "tasks complete",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
      {
        command: "tasks reopen",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
      {
        command: "tasks unschedule",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
      {
        command: "operations undo",
        kind: "write",
        requiredScopes: ["tasks:write"],
        requiresIdempotencyKey: true,
        supportsDryRun: true,
      },
    ],
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
  const command = args.positionals.slice(0, 2).join(" ");
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
