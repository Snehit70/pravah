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

    const legacyTasks = await ctx.db
      .query("tasks")
      .filter((q) => q.eq(q.field("ownerTokenIdentifier"), undefined))
      .collect();
    const legacyIntegrations = await ctx.db
      .query("integrations")
      .filter((q) => q.eq(q.field("ownerTokenIdentifier"), undefined))
      .collect();
    const legacyCursors = await ctx.db
      .query("syncCursors")
      .filter((q) => q.eq(q.field("ownerTokenIdentifier"), undefined))
      .collect();
    const legacyMappings = await ctx.db
      .query("externalTaskMappings")
      .filter((q) => q.eq(q.field("ownerTokenIdentifier"), undefined))
      .collect();
    const legacyReviewItems = await ctx.db
      .query("reviewQueue")
      .filter((q) => q.eq(q.field("ownerTokenIdentifier"), undefined))
      .collect();
    const legacyRuns = await ctx.db
      .query("syncRuns")
      .filter((q) => q.eq(q.field("ownerTokenIdentifier"), undefined))
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

    return {
      claimed:
        legacyTasks.length +
          legacyIntegrations.length +
          legacyCursors.length +
          legacyMappings.length +
          legacyReviewItems.length +
          legacyRuns.length >
        0,
    };
  },
});
