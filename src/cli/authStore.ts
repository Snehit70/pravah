/// <reference types="node" />
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface StoredCredential {
  secret: string;
  label: string;
  scopes: string[];
  ownerTokenIdentifier: string;
  siteUrl?: string;
  userId?: string;
  email?: string;
}

function parseCredential(value: unknown, invalidMessage: string): StoredCredential {
  const parsed = value as Partial<StoredCredential>;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.secret !== "string" ||
    typeof parsed.label !== "string" ||
    !Array.isArray(parsed.scopes) ||
    typeof parsed.ownerTokenIdentifier !== "string"
  ) {
    throw new Error(invalidMessage);
  }
  return {
    secret: parsed.secret,
    label: parsed.label,
    scopes: parsed.scopes.filter((scope): scope is string => typeof scope === "string"),
    ownerTokenIdentifier: parsed.ownerTokenIdentifier,
    siteUrl: typeof parsed.siteUrl === "string" ? parsed.siteUrl : undefined,
    userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
    email: typeof parsed.email === "string" ? parsed.email : undefined,
  };
}

export function getCredentialStorePath() {
  const configHome =
    process.env.XDG_CONFIG_HOME ??
    join(process.env.HOME ?? homedir(), ".config");
  return join(configHome, "pravah", "credentials.json");
}

export function saveStoredCredential(credential: StoredCredential) {
  const path = getCredentialStorePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  writeFileSync(path, JSON.stringify(credential, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  chmodSync(path, 0o600);
}

export function loadStoredCredential(): StoredCredential | null {
  const path = getCredentialStorePath();
  if (!existsSync(path)) {
    return null;
  }
  const raw = readFileSync(path, "utf8");
  return parseCredential(JSON.parse(raw), "Stored credential file is invalid");
}

export function parseCredentialImport(value: string): StoredCredential {
  return parseCredential(JSON.parse(value), "Credential import payload is invalid");
}
