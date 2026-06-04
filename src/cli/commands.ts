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
  const credentialJson = readOption(args.options, "credential-json");
  const bootstrapToken = readOption(args.options, "bootstrap-token");
  const sources = [
    bootstrapToken ? "bootstrap-token" : null,
    credentialFile ? "credential-file" : null,
    credentialJson ? "credential-json" : null,
  ].filter((source): source is string => source !== null);
  if (sources.length !== 1) {
    throw new Error(
      "Provide exactly one of --bootstrap-token, --credential-file, or --credential-json"
    );
  }

  const imported = bootstrapToken
    ? await (() => {
        const authClient = createCliAuthClient(process.env);
        if (!authClient) {
          throw new Error(
            "CLI HTTP URL is not configured. Set PRAVAH_HTTP_URL or CONVEX_SITE_URL before importing a bootstrap token."
          );
        }
        return authClient.exchangeBootstrapToken(bootstrapToken);
      })()
    : parseCredentialImport(
        credentialJson ?? readFileSync(credentialFile!, "utf8")
      );
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

export async function executeCommand(context: CommandContext, args: ParsedArgs) {
  const command = args.positionals.slice(0, 2).join(" ");
  validateCommandArgs(command, args);
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
