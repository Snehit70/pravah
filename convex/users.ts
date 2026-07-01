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

    if (existingUser?.legacyDataClaimedAt !== undefined) {
      return { claimed: false, skipped: true };
    }

    // Pravah is currently a single-user product. This migration intentionally
    // claims any legacy ownerless records for the authenticated user so older
    // local/dev data becomes visible again after ownerTokenIdentifier was added.

    const legacyTasks = await ctx.db
      .query("tasks")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", undefined))
      .collect();
    const legacyIntegrations = await ctx.db
      .query("integrations")
      .withIndex("by_owner_provider", (q) => q.eq("ownerTokenIdentifier", undefined))
      .collect();
    const legacyCursors = await ctx.db
      .query("syncCursors")
      .withIndex("by_owner_provider", (q) => q.eq("ownerTokenIdentifier", undefined))
      .collect();
    const legacyMappings = await ctx.db
      .query("externalTaskMappings")
      .withIndex("by_owner_provider_external_id", (q) =>
        q.eq("ownerTokenIdentifier", undefined)
      )
      .collect();
    const legacyReviewItems = await ctx.db
      .query("reviewQueue")
      .withIndex("by_owner_status", (q) => q.eq("ownerTokenIdentifier", undefined))
      .collect();
    const legacyRuns = await ctx.db
      .query("syncRuns")
      .withIndex("by_owner_status", (q) => q.eq("ownerTokenIdentifier", undefined))
      .collect();

    await Promise.all(legacyTasks.map((doc) => ctx.db.patch(doc._id, { ownerTokenIdentifier: tokenIdentifier })));
    await Promise.all(
      legacyIntegrations.map((doc) => ctx.db.patch(doc._id, { ownerTokenIdentifier: tokenIdentifier }))
    );
    await Promise.all(legacyCursors.map((doc) => ctx.db.patch(doc._id, { ownerTokenIdentifier: tokenIdentifier })));
    await Promise.all(legacyMappings.map((doc) => ctx.db.patch(doc._id, { ownerTokenIdentifier: tokenIdentifier })));
    await Promise.all(
      legacyReviewItems.map((doc) => ctx.db.patch(doc._id, { ownerTokenIdentifier: tokenIdentifier }))
    );
    await Promise.all(legacyRuns.map((doc) => ctx.db.patch(doc._id, { ownerTokenIdentifier: tokenIdentifier })));
    if (existingUser) {
      await ctx.db.patch(existingUser._id, { legacyDataClaimedAt: Date.now() });
    }

    return {
      claimed:
        legacyTasks.length +
          legacyIntegrations.length +
          legacyCursors.length +
          legacyMappings.length +
          legacyReviewItems.length +
          legacyRuns.length >
        0,
      skipped: false,
    };
  },
});
