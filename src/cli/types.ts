export const CLI_CONTRACT_VERSION = "v1";

export interface CliError {
  code: string;
  message: string;
  details?: unknown;
}

export interface CliSuccessEnvelope<T> {
  ok: true;
  version: typeof CLI_CONTRACT_VERSION;
  command: string;
  data: T;
}

export interface CliErrorEnvelope {
  ok: false;
  version: typeof CLI_CONTRACT_VERSION;
  command: string;
  error: CliError;
}

export type CliEnvelope<T> = CliSuccessEnvelope<T> | CliErrorEnvelope;

export interface ParsedArgs {
  positionals: string[];
  options: Record<string, string | boolean>;
}

export interface CommandContext {
  command: string;
  json: boolean;
}

export interface CredentialSummary {
  userId: string;
  email: string;
  credentialLabel: string;
  scopes: string[];
  siteUrl: string;
}

export interface MockTask {
  id: string;
  title: string;
  status: "inbox" | "scheduled" | "completed";
  scheduledDate?: string;
  deadline?: string;
  goal?: {
    id: string;
    title: string;
  };
}
