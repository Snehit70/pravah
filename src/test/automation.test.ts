import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import {
  exchangeBootstrapToken,
  issueBootstrapToken,
  listCredentials,
  markCredentialUsed,
  revokeCredential,
} from "../../convex/automation";

function makeId<TableName extends "automationCredentials" | "automationBootstrapTokens" | "automationAuditEvents">(
  value: string
) {
  return value as Id<TableName>;
}

type InternalHandler<TArgs, TResult> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<TResult>;
};

const issueBootstrapTokenHandler = (
  issueBootstrapToken as unknown as InternalHandler<
    { label: string; scopes: Array<"tasks:read" | "tasks:write">; ttlMinutes?: number },
    { bootstrapToken: string; expiresAt: number; label: string; scopes: string[] }
  >
)._handler;

const listCredentialsHandler = (
  listCredentials as unknown as InternalHandler<Record<string, never>, Array<Record<string, unknown>>>
)._handler;

const exchangeBootstrapTokenHandler = (
  exchangeBootstrapToken as unknown as InternalHandler<
    { bootstrapToken: string },
    {
      credentialId: Id<"automationCredentials">;
      credential: { secret: string; label: string; scopes: string[]; ownerTokenIdentifier: string };
    }
  >
)._handler;

const revokeCredentialHandler = (
  revokeCredential as unknown as InternalHandler<
    { credentialId: Id<"automationCredentials"> },
    { revoked: boolean; alreadyRevoked?: boolean }
  >
)._handler;

const markCredentialUsedHandler = (
  markCredentialUsed as unknown as InternalHandler<
    { credentialSecret: string },
    { label: string; scopes: string[]; ownerTokenIdentifier: string }
  >
)._handler;

function createAuthedCtx(db: unknown, tokenIdentifier = "user-1") {
  return {
    db,
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue({ tokenIdentifier }),
    },
  };
}

describe("automation credential handlers", () => {
  it("issues a short-lived bootstrap token and logs the event", async () => {
    const db = {
      insert: vi
        .fn()
        .mockResolvedValueOnce(makeId("bootstrap_1"))
        .mockResolvedValueOnce(makeId("audit_1")),
    };

    const ctx = createAuthedCtx(db);
    const result = await issueBootstrapTokenHandler(ctx, {
      label: "Codex local",
      scopes: ["tasks:read", "tasks:write"],
      ttlMinutes: 10,
    });

    expect(result.bootstrapToken).toMatch(/^pravah_bootstrap_/);
    expect(result.label).toBe("Codex local");
    expect(result.scopes).toEqual(["tasks:read", "tasks:write"]);
    expect(db.insert).toHaveBeenCalledTimes(2);
    expect(db.insert).toHaveBeenNthCalledWith(
      1,
      "automationBootstrapTokens",
      expect.objectContaining({
        ownerTokenIdentifier: "user-1",
        label: "Codex local",
        status: "active",
      })
    );
  });

  it("lists credentials without exposing credential hashes", async () => {
    const db = {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          collect: vi.fn().mockResolvedValue([
            {
              _id: makeId("cred_1"),
              ownerTokenIdentifier: "user-1",
              label: "Laptop",
              credentialHash: "secret-hash",
              credentialPreview: "pravah_cred_abcd...",
              scopes: ["tasks:read"],
              status: "active",
              createdAt: 10,
              updatedAt: 10,
            },
          ]),
        }),
      }),
    };

    const ctx = createAuthedCtx(db);
    const result = await listCredentialsHandler(ctx, {});

    expect(result[0]).toMatchObject({
      label: "Laptop",
      credentialPreview: "pravah_cred_abcd...",
    });
    expect(result[0]).not.toHaveProperty("credentialHash");
  });

  it("exchanges an active bootstrap token for a real credential", async () => {
    const bootstrapId = makeId("bootstrap_1");
    const credentialId = makeId("cred_1") as Id<"automationCredentials">;
    const db = {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            _id: bootstrapId,
            ownerTokenIdentifier: "user-1",
            label: "Laptop",
            scopes: ["tasks:read"],
            status: "active",
            expiresAt: Date.now() + 60_000,
          }),
        }),
      }),
      insert: vi
        .fn()
        .mockResolvedValueOnce(credentialId)
        .mockResolvedValueOnce(makeId("audit_1")),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const ctx = createAuthedCtx(db);
    const result = await exchangeBootstrapTokenHandler(ctx, {
      bootstrapToken: "pravah_bootstrap_demo",
    });

    expect(result.credentialId).toBe(credentialId);
    expect(result.credential.secret).toMatch(/^pravah_cred_/);
    expect(db.patch).toHaveBeenCalledWith(
      bootstrapId,
      expect.objectContaining({
        status: "used",
        exchangedCredentialId: credentialId,
      })
    );
  });

  it("revokes an active credential owned by the current user", async () => {
    const credentialId = makeId("cred_1") as Id<"automationCredentials">;
    const db = {
      get: vi.fn().mockResolvedValue({
        _id: credentialId,
        ownerTokenIdentifier: "user-1",
        label: "Laptop",
        status: "active",
      }),
      patch: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockResolvedValue(makeId("audit_1")),
    };

    const ctx = createAuthedCtx(db);
    const result = await revokeCredentialHandler(ctx, {
      credentialId,
    });

    expect(result).toEqual({ revoked: true });
    expect(db.patch).toHaveBeenCalledWith(
      credentialId,
      expect.objectContaining({
        status: "revoked",
      })
    );
  });

  it("marks an active credential as used", async () => {
    const credentialId = makeId("cred_1");
    const db = {
      query: vi.fn().mockReturnValue({
        withIndex: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            _id: credentialId,
            ownerTokenIdentifier: "user-1",
            label: "Laptop",
            scopes: ["tasks:read", "agent:read"],
            status: "active",
          }),
        }),
      }),
      patch: vi.fn().mockResolvedValue(undefined),
      insert: vi.fn().mockResolvedValue(makeId("audit_1")),
    };

    const ctx = createAuthedCtx(db);
    const result = await markCredentialUsedHandler(ctx, {
      credentialSecret: "pravah_cred_demo",
    });

    expect(result).toMatchObject({
      label: "Laptop",
      ownerTokenIdentifier: "user-1",
      scopes: ["tasks:read", "agent:read"],
    });
    expect(db.patch).toHaveBeenCalledWith(
      credentialId,
      expect.objectContaining({
        lastUsedAt: expect.any(Number),
      })
    );
  });
});
