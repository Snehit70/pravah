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

export interface CliTextResult {
  kind: "text";
  text: string;
}

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

export type CliTaskStatus = "inbox" | "timeline" | "completed" | "cancelled";

export interface MockTask {
  id: string;
  title: string;
  status: CliTaskStatus;
  description?: string;
  deadline?: string;
  time?: string;
  scheduledAt: number;
  completedAt?: number;
  cancelledAt?: number;
  priority?: "p1" | "p2" | "p3";
  source?: "manual" | "ai-agent" | "gmail" | "gcal";
  createdAt?: number;
  updatedAt?: number;
  position?: number;
  goal?: {
    id: string;
    title: string;
  };
}

export interface MockGoal {
  id: string;
  text: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
  createdAt: number;
}
