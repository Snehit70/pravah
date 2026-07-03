import { mutation } from "./_generated/server";
import { requireIdentity, requireTokenIdentifier } from "./authHelpers";

export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.tokenIdentifier))
      .unique();

    const userFields = {
      tokenIdentifier: identity.tokenIdentifier,
      email: identity.email,
      image: identity.pictureUrl,
      name:
        identity.name ??
        (typeof identity.email === "string" ? identity.email.split("@")[0] : undefined),
    };

    if (existingUser) {
      await ctx.db.patch(existingUser._id, userFields);
      return existingUser._id;
    }

    return await ctx.db.insert("users", userFields);
  },
});

export const claimLegacyData = mutation({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", tokenIdentifier))
      .unique();

    if (existingUser?.legacyDataClaimedAt) {
      return {
        claimed: false,
        skipped: true,
      };
    }

    const claimedAt = Date.now();
    const counts = {
      tasks: 0,
      integrations: 0,
      syncCursors: 0,
      externalTaskMappings: 0,
      reviewQueue: 0,
      syncRuns: 0,
    };

    for (const row of await ctx.db.query("tasks").collect()) {
      if (row.ownerTokenIdentifier) continue;
      await ctx.db.patch(row._id, { ownerTokenIdentifier: tokenIdentifier });
      counts.tasks += 1;
    }

    for (const row of await ctx.db.query("integrations").collect()) {
      if (row.ownerTokenIdentifier) continue;
      await ctx.db.patch(row._id, { ownerTokenIdentifier: tokenIdentifier });
      counts.integrations += 1;
    }

    for (const row of await ctx.db.query("syncCursors").collect()) {
      if (row.ownerTokenIdentifier) continue;
      await ctx.db.patch(row._id, { ownerTokenIdentifier: tokenIdentifier });
      counts.syncCursors += 1;
    }

    for (const row of await ctx.db.query("externalTaskMappings").collect()) {
      if (row.ownerTokenIdentifier) continue;
      await ctx.db.patch(row._id, { ownerTokenIdentifier: tokenIdentifier });
      counts.externalTaskMappings += 1;
    }

    for (const row of await ctx.db.query("reviewQueue").collect()) {
      if (row.ownerTokenIdentifier) continue;
      await ctx.db.patch(row._id, { ownerTokenIdentifier: tokenIdentifier });
      counts.reviewQueue += 1;
    }

    for (const row of await ctx.db.query("syncRuns").collect()) {
      if (row.ownerTokenIdentifier) continue;
      await ctx.db.patch(row._id, { ownerTokenIdentifier: tokenIdentifier });
      counts.syncRuns += 1;
    }

    if (existingUser) {
      await ctx.db.patch(existingUser._id, { legacyDataClaimedAt: claimedAt });
    }

    return {
      claimed: true,
      skipped: false,
      counts,
      claimedAt,
    };
  },
});
