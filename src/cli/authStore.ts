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
  const scopes =
    Array.isArray(parsed?.scopes) &&
    parsed.scopes.every(
      (scope) => typeof scope === "string" && scope.trim().length > 0
    )
      ? parsed.scopes
      : null;
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof parsed.secret !== "string" ||
    parsed.secret.trim().length === 0 ||
    typeof parsed.label !== "string" ||
    parsed.label.trim().length === 0 ||
    !scopes ||
    scopes.length === 0 ||
    typeof parsed.ownerTokenIdentifier !== "string" ||
    parsed.ownerTokenIdentifier.trim().length === 0
  ) {
    throw new Error(invalidMessage);
  }
  return {
    secret: parsed.secret.trim(),
    label: parsed.label.trim(),
    scopes,
    ownerTokenIdentifier: parsed.ownerTokenIdentifier.trim(),
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
  try {
    const raw = readFileSync(path, "utf8");
    return parseCredential(JSON.parse(raw), "Stored credential file is invalid");
  } catch {
    throw new Error("Stored credential file is invalid");
  }
}

export function parseCredentialImport(value: string): StoredCredential {
  try {
    return parseCredential(JSON.parse(value), "Credential import payload is invalid");
  } catch {
    throw new Error("Credential import payload is invalid");
  }
}
