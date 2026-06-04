/// <reference types="node" />
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

export function getCredentialStorePath() {
  return join(homedir(), ".config", "pravah", "credentials.json");
}

export function saveStoredCredential(credential: StoredCredential) {
  const path = getCredentialStorePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(credential, null, 2), "utf8");
}

export function loadStoredCredential(): StoredCredential | null {
  const path = getCredentialStorePath();
  if (!existsSync(path)) {
    return null;
  }
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as Partial<StoredCredential>;
  if (
    typeof parsed.secret !== "string" ||
    typeof parsed.label !== "string" ||
    !Array.isArray(parsed.scopes) ||
    typeof parsed.ownerTokenIdentifier !== "string"
  ) {
    throw new Error("Stored credential file is invalid");
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

export function parseCredentialImport(value: string): StoredCredential {
  const parsed = JSON.parse(value) as Partial<StoredCredential>;
  if (
    typeof parsed.secret !== "string" ||
    typeof parsed.label !== "string" ||
    !Array.isArray(parsed.scopes) ||
    typeof parsed.ownerTokenIdentifier !== "string"
  ) {
    throw new Error("Credential import payload is invalid");
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
