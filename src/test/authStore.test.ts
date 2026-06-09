/// <reference types="node" />
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getCredentialStorePath,
  loadStoredCredential,
  parseCredentialImport,
  saveStoredCredential,
} from "../cli/authStore";

const originalHome = process.env.HOME;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

afterEach(() => {
  if (originalHome === undefined) {
    delete process.env.HOME;
  } else {
    process.env.HOME = originalHome;
  }
  if (originalXdgConfigHome === undefined) {
    delete process.env.XDG_CONFIG_HOME;
  } else {
    process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
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

  it("rejects malformed and incomplete credential imports consistently", () => {
    expect(() => parseCredentialImport("{broken")).toThrow(
      "Credential import payload is invalid"
    );
    expect(() =>
      parseCredentialImport(
        JSON.stringify({
          secret: "",
          label: "Laptop",
          scopes: [],
          ownerTokenIdentifier: "user-1",
        })
      )
    ).toThrow("Credential import payload is invalid");
  });

  it("saves and reloads a stored credential under the user config dir", () => {
    const home = mkdtempSync(join(tmpdir(), "pravah-auth-store-"));
    process.env.HOME = home;
    delete process.env.XDG_CONFIG_HOME;

    saveStoredCredential({
      secret: "pravah_cred_saved",
      label: "Desktop",
      scopes: ["tasks:read", "tasks:write"],
      ownerTokenIdentifier: "user-1",
      siteUrl: "https://pravah.example.com",
    });

    const path = getCredentialStorePath();
    const configDir = dirname(path);
    const raw = JSON.parse(readFileSync(path, "utf8")) as { label: string };
    expect(raw.label).toBe("Desktop");
    expect(statSync(path).mode & 0o777).toBe(0o600);
    expect(statSync(configDir).mode & 0o777).toBe(0o700);

    expect(loadStoredCredential()).toMatchObject({
      label: "Desktop",
      scopes: ["tasks:read", "tasks:write"],
      siteUrl: "https://pravah.example.com",
    });
  });

  it("rejects malformed stored credential JSON consistently", () => {
    const home = mkdtempSync(join(tmpdir(), "pravah-auth-store-"));
    process.env.HOME = home;
    delete process.env.XDG_CONFIG_HOME;
    const path = getCredentialStorePath();
    saveStoredCredential({
      secret: "pravah_cred_saved",
      label: "Desktop",
      scopes: ["tasks:read"],
      ownerTokenIdentifier: "user-1",
    });
    writeFileSync(path, "{broken", "utf8");

    expect(() => loadStoredCredential()).toThrow("Stored credential file is invalid");
  });
});
