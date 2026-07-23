import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

declare const process: {
  env: Record<string, string | undefined>;
};

const controlKey = "mobile" as const;

function assertDeploymentAuthority(deploymentSecret: string): void {
  const expected = process.env.MOBILE_RELEASE_DEPLOY_SECRET;
  if (!expected || deploymentSecret !== expected) {
    throw new Error("Invalid mobile release deployment authority");
  }
}

function nextPatch(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) throw new Error(`Invalid release version: ${version}`);
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export const getState = query({
  args: {},
  handler: async (ctx) => {
    const control = await ctx.db
      .query("mobileReleaseControl")
      .withIndex("by_key", (q) => q.eq("key", controlKey))
      .unique();
    if (!control) return null;
    return {
      latestVersion: control.latestVersion,
      supportedRuntime: control.supportedRuntime,
      supportedFingerprint: control.supportedFingerprint,
      minimumRuntime: control.minimumRuntime,
      revision: control.revision,
    };
  },
});

export const reserve = mutation({
  args: {
    deploymentSecret: v.string(),
    expectedRevision: v.number(),
    delivery: v.union(
      v.literal("ota"),
      v.literal("native"),
      v.literal("rollback"),
    ),
    sourceSha: v.string(),
    sourceRef: v.string(),
    title: v.string(),
    releaseNotes: v.string(),
    pullRequests: v.array(v.number()),
    nativeRuntime: v.string(),
    nativeFingerprint: v.string(),
    rollbackOfVersion: v.optional(v.string()),
    restoresVersion: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDeploymentAuthority(args.deploymentSecret);
    const control = await ctx.db
      .query("mobileReleaseControl")
      .withIndex("by_key", (q) => q.eq("key", controlKey))
      .unique();
    if (!control) throw new Error("Mobile release control is not seeded");
    if (control.revision !== args.expectedRevision) {
      throw new Error(
        `Release control revision changed: expected ${args.expectedRevision}, got ${control.revision}`,
      );
    }

    const pending = await ctx.db
      .query("mobileReleaseAttempts")
      .withIndex("by_source_status", (q) =>
        q.eq("sourceSha", args.sourceSha).eq("status", "pending"),
      )
      .first();
    const staged = pending
      ? null
      : await ctx.db
          .query("mobileReleaseAttempts")
          .withIndex("by_source_status", (q) =>
            q.eq("sourceSha", args.sourceSha).eq("status", "staged"),
          )
          .first();
    const existing = pending ?? staged;
    if (existing) {
      return {
        attemptId: existing._id,
        version: existing.version,
        revision: control.revision,
      };
    }

    if (args.delivery === "ota") {
      if (args.nativeRuntime !== control.supportedRuntime) {
        throw new Error("OTA runtime does not match the supported runtime");
      }
      if (args.nativeFingerprint !== control.supportedFingerprint) {
        throw new Error("OTA fingerprint does not match the supported runtime");
      }
    }

    const version = nextPatch(control.latestVersion);
    const now = Date.now();
    const attemptId = await ctx.db.insert("mobileReleaseAttempts", {
      version,
      status: "pending",
      delivery: args.delivery,
      sourceSha: args.sourceSha,
      sourceRef: args.sourceRef,
      title: args.title.trim(),
      releaseNotes: args.releaseNotes.trim(),
      pullRequests: [...new Set(args.pullRequests)].sort((a, b) => a - b),
      nativeRuntime: args.nativeRuntime,
      nativeFingerprint: args.nativeFingerprint,
      rollbackOfVersion: args.rollbackOfVersion,
      restoresVersion: args.restoresVersion,
      createdAt: now,
      updatedAt: now,
    });
    const revision = control.revision + 1;
    await ctx.db.patch(control._id, {
      revision,
      updatedAt: now,
    });
    return { attemptId, version, revision };
  },
});

export const markStaged = mutation({
  args: {
    deploymentSecret: v.string(),
    attemptId: v.id("mobileReleaseAttempts"),
    easUpdateId: v.optional(v.string()),
    easBranch: v.optional(v.string()),
    githubTag: v.optional(v.string()),
    artifactUrl: v.optional(v.string()),
    checksumUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDeploymentAuthority(args.deploymentSecret);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Release attempt not found");
    if (attempt.status === "staged") {
      return { version: attempt.version, status: attempt.status };
    }
    if (attempt.status !== "pending") {
      throw new Error(`Cannot stage release attempt from ${attempt.status}`);
    }

    if (attempt.delivery === "native") {
      if (!args.githubTag || !args.artifactUrl || !args.checksumUrl) {
        throw new Error("Native staging requires verified GitHub release assets");
      }
    } else if (!args.easUpdateId || !args.easBranch) {
      throw new Error("OTA staging requires an EAS update and isolated branch");
    }

    const now = Date.now();
    await ctx.db.patch(args.attemptId, {
      status: "staged",
      easUpdateId: args.easUpdateId,
      easBranch: args.easBranch,
      githubTag: args.githubTag,
      artifactUrl: args.artifactUrl,
      checksumUrl: args.checksumUrl,
      stagedAt: now,
      updatedAt: now,
    });
    return { version: attempt.version, status: "staged" as const };
  },
});

export const publish = mutation({
  args: {
    deploymentSecret: v.string(),
    attemptId: v.id("mobileReleaseAttempts"),
    expectedRevision: v.number(),
  },
  handler: async (ctx, args) => {
    assertDeploymentAuthority(args.deploymentSecret);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Release attempt not found");
    const control = await ctx.db
      .query("mobileReleaseControl")
      .withIndex("by_key", (q) => q.eq("key", controlKey))
      .unique();
    if (!control) throw new Error("Mobile release control is not seeded");

    if (attempt.status === "published") {
      return { version: attempt.version, revision: control.revision };
    }
    if (attempt.status !== "staged") {
      throw new Error(`Cannot publish release attempt from ${attempt.status}`);
    }
    if (control.revision !== args.expectedRevision) {
      throw new Error(
        `Release control revision changed: expected ${args.expectedRevision}, got ${control.revision}`,
      );
    }
    if (nextPatch(control.latestVersion) !== attempt.version) {
      throw new Error("Release attempt is not the next successful version");
    }

    const now = Date.now();
    const revision = control.revision + 1;
    await ctx.db.patch(args.attemptId, {
      status: "published",
      publishedAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(control._id, {
      latestVersion: attempt.version,
      supportedRuntime:
        attempt.delivery === "native"
          ? attempt.nativeRuntime
          : control.supportedRuntime,
      supportedFingerprint:
        attempt.delivery === "native"
          ? attempt.nativeFingerprint
          : control.supportedFingerprint,
      revision,
      updatedAt: now,
    });
    return { version: attempt.version, revision };
  },
});

export const markFailed = mutation({
  args: {
    deploymentSecret: v.string(),
    attemptId: v.id("mobileReleaseAttempts"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    assertDeploymentAuthority(args.deploymentSecret);
    const attempt = await ctx.db.get(args.attemptId);
    if (!attempt) throw new Error("Release attempt not found");
    if (attempt.status === "published") {
      throw new Error("A published release cannot be marked failed");
    }
    const now = Date.now();
    await ctx.db.patch(args.attemptId, {
      status: "failed",
      failureReason: args.reason.trim(),
      failedAt: now,
      updatedAt: now,
    });
    return { version: attempt.version, status: "failed" as const };
  },
});

export const listPublished = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 20, 100));
    const releases = await ctx.db
      .query("mobileReleaseAttempts")
      .withIndex("by_status_published_at", (q) =>
        q.eq("status", "published"),
      )
      .order("desc")
      .take(limit);
    return releases.map((release) => ({
        version: release.version,
        delivery: release.delivery,
        title: release.title,
        releaseNotes: release.releaseNotes,
        nativeRuntime: release.nativeRuntime,
        publishedAt: release.publishedAt,
        rollbackOfVersion: release.rollbackOfVersion,
        restoresVersion: release.restoresVersion,
      }));
  },
});

export const seed = mutation({
  args: {
    deploymentSecret: v.string(),
    version: v.string(),
    nativeRuntime: v.string(),
    nativeFingerprint: v.string(),
    sourceSha: v.string(),
    title: v.string(),
    releaseNotes: v.string(),
    githubTag: v.string(),
    artifactUrl: v.string(),
    checksumUrl: v.string(),
    publishedAt: v.number(),
  },
  handler: async (ctx, args) => {
    assertDeploymentAuthority(args.deploymentSecret);
    const existing = await ctx.db
      .query("mobileReleaseControl")
      .withIndex("by_key", (q) => q.eq("key", controlKey))
      .unique();
    if (existing) {
      if (
        existing.latestVersion === args.version &&
        existing.supportedRuntime === args.nativeRuntime &&
        existing.supportedFingerprint === args.nativeFingerprint
      ) {
        return { seeded: false, revision: existing.revision };
      }
      throw new Error("Mobile release control is already seeded");
    }

    const now = Date.now();
    await ctx.db.insert("mobileReleaseAttempts", {
      version: args.version,
      status: "published",
      delivery: "native",
      sourceSha: args.sourceSha,
      sourceRef: args.githubTag,
      title: args.title.trim(),
      releaseNotes: args.releaseNotes.trim(),
      pullRequests: [],
      nativeRuntime: args.nativeRuntime,
      nativeFingerprint: args.nativeFingerprint,
      githubTag: args.githubTag,
      artifactUrl: args.artifactUrl,
      checksumUrl: args.checksumUrl,
      createdAt: args.publishedAt,
      updatedAt: now,
      stagedAt: args.publishedAt,
      publishedAt: args.publishedAt,
    });
    await ctx.db.insert("mobileReleaseControl", {
      key: controlKey,
      latestVersion: args.version,
      supportedRuntime: args.nativeRuntime,
      supportedFingerprint: args.nativeFingerprint,
      revision: 1,
      updatedAt: now,
    });
    return { seeded: true, revision: 1 };
  },
});

export const setMinimumRuntime = mutation({
  args: {
    deploymentSecret: v.string(),
    nativeRuntime: v.string(),
    confirmation: v.string(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    assertDeploymentAuthority(args.deploymentSecret);
    if (args.confirmation !== `SET MINIMUM RUNTIME ${args.nativeRuntime}`) {
      throw new Error("Minimum runtime confirmation does not match");
    }
    const control = await ctx.db
      .query("mobileReleaseControl")
      .withIndex("by_key", (q) => q.eq("key", controlKey))
      .unique();
    if (!control) throw new Error("Mobile release control is not seeded");
    await ctx.db.patch(control._id, {
      minimumRuntime: args.nativeRuntime,
      revision: control.revision + 1,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("mobileReleaseOperations", {
      operation: "set_minimum_runtime",
      target: args.nativeRuntime,
      reason: args.reason.trim(),
      createdAt: Date.now(),
    });
    return {
      minimumRuntime: args.nativeRuntime,
      revision: control.revision + 1,
      reason: args.reason.trim(),
    };
  },
});
