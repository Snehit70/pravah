/// <reference types="node" />
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCredentialStorePath,
  loadStoredCredential,
  parseCredentialImport,
  saveStoredCredential,
} from "../cli/authStore";

const originalHome = process.env.HOME;

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  vi.restoreAllMocks();
});

describe("authStore", () => {
  it("parses a valid credential import payload", () => {
    const parsed = parseCredentialImport(
      JSON.stringify({
        secret: "pravah_cred_demo",
        label: "Laptop",
        scopes: ["tasks:read"],
        ownerTokenIdentifier: "user-1",
      })
    );

    expect(parsed).toMatchObject({
      label: "Laptop",
      ownerTokenIdentifier: "user-1",
      scopes: ["tasks:read"],
    });
  });

  it("saves and reloads a stored credential under the user config dir", () => {
    const home = mkdtempSync(join(tmpdir(), "pravah-auth-store-"));
    process.env.HOME = home;

    saveStoredCredential({
      secret: "pravah_cred_saved",
      label: "Desktop",
      scopes: ["tasks:read", "tasks:write"],
      ownerTokenIdentifier: "user-1",
      siteUrl: "https://pravah.example.com",
    });

    const path = getCredentialStorePath();
    const raw = JSON.parse(readFileSync(path, "utf8")) as { label: string };
    expect(raw.label).toBe("Desktop");

    expect(loadStoredCredential()).toMatchObject({
      label: "Desktop",
      scopes: ["tasks:read", "tasks:write"],
      siteUrl: "https://pravah.example.com",
    });
  });
});
