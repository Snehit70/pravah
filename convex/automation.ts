import { mutation, query, type MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireTokenIdentifier } from "./authHelpers";

const automationScope = v.union(
  v.literal("tasks:read"),
  v.literal("tasks:write"),
  v.literal("review:read"),
  v.literal("review:write"),
  v.literal("sync:read"),
  v.literal("sync:run"),
  v.literal("agent:read")
);

type AutomationScope =
  | "tasks:read"
  | "tasks:write"
  | "review:read"
  | "review:write"
  | "sync:read"
  | "sync:run"
  | "agent:read";

const CREDENTIAL_USAGE_WRITE_INTERVAL_MS = 5 * 60 * 1000;
const MAX_CREDENTIAL_LABEL_LENGTH = 100;

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (part) => part.toString(16).padStart(2, "0")).join("");
}

function createSecret(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function normalizeBootstrapInput(label: string, scopes: AutomationScope[]) {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    throw new Error("Credential label is required");
  }
  if (normalizedLabel.length > MAX_CREDENTIAL_LABEL_LENGTH) {
    throw new Error(
      `Credential label must be at most ${MAX_CREDENTIAL_LABEL_LENGTH} characters`
    );
  }
  const normalizedScopes = [...new Set(scopes)];
  if (normalizedScopes.length === 0) {
    throw new Error("At least one automation scope is required");
  }
  return { label: normalizedLabel, scopes: normalizedScopes };
}

async function insertAuditEvent(
  ctx: MutationCtx,
  input: {
    ownerTokenIdentifier: string;
    credentialId?: Id<"automationCredentials">;
    bootstrapTokenId?: Id<"automationBootstrapTokens">;
    eventType: "bootstrap_issued" | "bootstrap_exchanged" | "credential_revoked" | "credential_used";
    metadata?: Record<string, unknown>;
  }
) {
  await ctx.db.insert("automationAuditEvents", {
    ownerTokenIdentifier: input.ownerTokenIdentifier,
    credentialId: input.credentialId,
    bootstrapTokenId: input.bootstrapTokenId,
    eventType: input.eventType,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : undefined,
    createdAt: Date.now(),
  });
}

export const listCredentials = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const credentials = await ctx.db
      .query("automationCredentials")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect();

    return credentials
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(({ credentialHash: _credentialHash, ...credential }) => credential);
  },
});

export const issueBootstrapToken = mutation({
  args: {
    label: v.string(),
    scopes: v.array(automationScope),
    ttlMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const normalized = normalizeBootstrapInput(args.label, args.scopes);
    const bootstrapToken = createSecret("pravah_bootstrap");
    const tokenHash = await sha256Hex(bootstrapToken);
    const now = Date.now();
    const expiresAt = now + Math.max(1, Math.min(args.ttlMinutes ?? 15, 60)) * 60 * 1000;

    const bootstrapTokenId = await ctx.db.insert("automationBootstrapTokens", {
      ownerTokenIdentifier: tokenIdentifier,
      label: normalized.label,
      tokenHash,
      scopes: normalized.scopes,
      status: "active",
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await insertAuditEvent(ctx, {
      ownerTokenIdentifier: tokenIdentifier,
      bootstrapTokenId,
      eventType: "bootstrap_issued",
      metadata: {
        label: normalized.label,
        scopes: normalized.scopes,
        expiresAt,
      },
    });

    return {
      bootstrapTokenId,
      bootstrapToken,
      expiresAt,
      label: normalized.label,
      scopes: normalized.scopes,
    };
  },
});

export const exchangeBootstrapToken = mutation({
  args: {
    bootstrapToken: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const tokenHash = await sha256Hex(args.bootstrapToken);
    const record = await ctx.db
      .query("automationBootstrapTokens")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();

    if (!record) {
      throw new Error("Bootstrap token not found");
    }
    if (record.status !== "active") {
      throw new Error(`Bootstrap token is ${record.status}`);
    }
    if (record.expiresAt < Date.now()) {
      await ctx.db.patch(record._id, {
        status: "expired",
        updatedAt: Date.now(),
      });
      throw new Error("Bootstrap token expired");
    }

    const credentialSecret = createSecret("pravah_cred");
    const credentialHash = await sha256Hex(credentialSecret);
    const now = Date.now();
    const credentialPreview = `${credentialSecret.slice(0, 16)}...`;

    const credentialId = await ctx.db.insert("automationCredentials", {
      ownerTokenIdentifier: record.ownerTokenIdentifier,
      label: record.label,
      credentialHash,
      credentialPreview,
      scopes: record.scopes,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.patch(record._id, {
      status: "used",
      usedAt: now,
      updatedAt: now,
      exchangedCredentialId: credentialId,
    });

    await insertAuditEvent(ctx, {
      ownerTokenIdentifier: record.ownerTokenIdentifier,
      credentialId,
      bootstrapTokenId: record._id,
      eventType: "bootstrap_exchanged",
      metadata: {
        exchangedByTokenIdentifier: identity?.tokenIdentifier,
        label: record.label,
      },
    });

    return {
      credentialId,
      credential: {
        secret: credentialSecret,
        label: record.label,
        scopes: record.scopes,
        ownerTokenIdentifier: record.ownerTokenIdentifier,
      },
    };
  },
});

export const revokeCredential = mutation({
  args: {
    credentialId: v.id("automationCredentials"),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const credential = await ctx.db.get(args.credentialId);
    if (!credential || credential.ownerTokenIdentifier !== tokenIdentifier) {
      throw new Error("Credential not found");
    }
    if (credential.status === "revoked") {
      return { revoked: false, alreadyRevoked: true };
    }

    const now = Date.now();
    await ctx.db.patch(args.credentialId, {
      status: "revoked",
      revokedAt: now,
      updatedAt: now,
    });

    await insertAuditEvent(ctx, {
      ownerTokenIdentifier: tokenIdentifier,
      credentialId: args.credentialId,
      eventType: "credential_revoked",
      metadata: {
        label: credential.label,
      },
    });

    return { revoked: true };
  },
});

export const markCredentialUsed = mutation({
  args: {
    credentialSecret: v.string(),
  },
  handler: async (ctx, args) => {
    const credentialHash = await sha256Hex(args.credentialSecret);
    const credential = await ctx.db
      .query("automationCredentials")
      .withIndex("by_credential_hash", (q) => q.eq("credentialHash", credentialHash))
      .first();

    if (!credential || credential.status !== "active") {
      throw new Error("Credential not found");
    }

    const now = Date.now();
    if (
      credential.lastUsedAt === undefined ||
      now - credential.lastUsedAt >= CREDENTIAL_USAGE_WRITE_INTERVAL_MS
    ) {
      await ctx.db.patch(credential._id, {
        lastUsedAt: now,
        updatedAt: now,
      });

      await insertAuditEvent(ctx, {
        ownerTokenIdentifier: credential.ownerTokenIdentifier,
        credentialId: credential._id,
        eventType: "credential_used",
        metadata: {
          label: credential.label,
        },
      });
    }

    return {
      credentialId: credential._id,
      label: credential.label,
      scopes: credential.scopes as AutomationScope[],
      ownerTokenIdentifier: credential.ownerTokenIdentifier,
    };
  },
});
