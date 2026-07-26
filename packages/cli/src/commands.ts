/// <reference types="node" />
import { existsSync, unlinkSync } from "node:fs";
import { readOption } from "./args";
import { getCommandCapabilities, getCommandName, getCommandSpecFromPositionals, isKnownNamespace, readCliPackageVersion, renderCommandHelp, renderNamespaceHelp, renderTopLevelHelp, suggestClosestCommand } from "./commandSpec";
import { getCredentialStorePath, loadStoredCredential, saveStoredCredential } from "./authStore";
import { validateCommandArgs } from "./commandUtils";
import { executeLiveCommand } from "./liveCommands";
import { createCliAuthClient, createLiveClient, resolveCliHttpUrl } from "./liveClient";
import { executeMockCommand } from "./mockCommands";
import type { CliTextResult, CommandContext, ParsedArgs } from "./types";

const text = (value: string): CliTextResult => ({ kind: "text", text: value });
export const isCliTextResult = (value: unknown): value is CliTextResult => Boolean(value && typeof value === "object" && (value as CliTextResult).kind === "text");
const mock = () => process.env.PRAVAH_CLI_MOCK === "1";
export function resolveCommand(args: ParsedArgs) { if (args.positionals.length === 1 && args.positionals[0] === "status") return "auth status"; const spec = getCommandSpecFromPositionals(args.positionals); if (spec) return getCommandName(spec); const input = args.positionals.slice(0, 2).join(" "); throw new Error(`Unknown command: ${input}${suggestClosestCommand(input) ? `. Did you mean \`${suggestClosestCommand(input)}\`?` : ""}`); }
function help(args: ParsedArgs) { if (!args.positionals.length) return text(renderTopLevelHelp()); const namespace = args.positionals[0]; if (args.positionals.length === 1 && isKnownNamespace(namespace)) return text(renderNamespaceHelp(namespace)!); const spec = getCommandSpecFromPositionals(args.positionals); if (spec) return text(renderCommandHelp(spec)); throw new Error(`Unknown command: ${args.positionals.join(" ")}`); }
async function login(args: ParsedArgs) { const providedUrl = readOption(args.options, "url"); const token = readOption(args.options, "bootstrap-token"); if (!providedUrl || !token) throw new Error("auth login requires --url and --bootstrap-token in non-interactive use"); const client = createCliAuthClient({ ...process.env, PRAVAH_HTTP_URL: providedUrl }); if (!client) throw new Error("auth login requires a valid HTTP URL"); const credential = await client.exchangeBootstrapToken(token); saveStoredCredential({ ...credential, siteUrl: providedUrl.replace(/\/+$/, "") }); return { configured: true, credentialLabel: credential.label, scopes: credential.scopes, siteUrl: providedUrl.replace(/\/+$/, "") }; }
function authStatus() { const credential = loadStoredCredential(); let client = null; try { client = createLiveClient(process.env); } catch { client = null; } return { authenticated: Boolean(credential || client), credentialLabel: credential?.label ?? client?.credentialLabel ?? null, ownerTokenIdentifier: credential?.ownerTokenIdentifier ?? null, siteUrl: credential?.siteUrl ?? resolveCliHttpUrl(process.env) ?? null, scopes: credential?.scopes ?? client?.scopes ?? [], source: credential ? "stored" : client ? "environment" : null }; }
async function doctor() { const credential = (() => { try { return loadStoredCredential(); } catch { return null; } })(); let client = null; try { client = createLiveClient(process.env); } catch { client = null; } const siteUrl = credential?.siteUrl ?? resolveCliHttpUrl(process.env) ?? null; const scopes = credential?.scopes ?? client?.scopes ?? []; const checks = [{ name: "bun", ok: process.versions.bun !== undefined, remedy: "Install Bun and rerun Pravah." }, { name: "credential", ok: Boolean(credential || client), remedy: "Set CONVEX_HTTP_API_KEY and PRAVAH_HTTP_URL, or run pravah auth login --url <site> --bootstrap-token <token>." }, { name: "endpoint", ok: Boolean(siteUrl), remedy: "Run auth login with the deployment URL." }, { name: "tasks:read", ok: scopes.includes("tasks:read"), remedy: "Create a credential with tasks:read." }]; let reachable = false; if (client && checks.slice(1).every((check) => check.ok)) { try { await client.listTasks({}); reachable = true; } catch { reachable = false; } } checks.push({ name: "endpoint-reachable", ok: reachable, remedy: "Check the deployment URL and credential, then rerun pravah doctor." }); return { healthy: checks.every((check) => check.ok), checks, siteUrl }; }
export async function executeCommand(_context: CommandContext, args: ParsedArgs) {
  if (args.positionals.length === 1 && args.positionals[0] === "status") {
    return executeCommand(_context, { ...args, positionals: ["auth", "status"] });
  }
  if (args.options.version === true) return text(readCliPackageVersion());
  if (args.options.help === true || !args.positionals.length) return help(args);
  if (args.positionals[0] === "help") return help({ ...args, positionals: args.positionals.slice(1) });
  const command = resolveCommand(args); validateCommandArgs(command, args);
  if (command === "capabilities") return { contractVersion: "v2", commands: getCommandCapabilities() };
  if (command === "auth login") return login(args);
  if (command === "auth status") return authStatus();
  if (command === "auth logout") { const path = getCredentialStorePath(); if (existsSync(path)) unlinkSync(path); return { loggedOut: true, localOnly: true }; }
  if (command === "doctor") return doctor();
  if (mock()) return executeMockCommand(command, args);
  const client = createLiveClient(process.env); if (!client) throw new Error("Pravah CLI is not authenticated or its HTTP URL is missing. Run `pravah auth login`.");
  const result = await executeLiveCommand(client, command, args); if (result === null) throw new Error(`Unknown command: ${command}`); return result;
}
