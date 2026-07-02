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
    return {
      claimed: false,
      skipped: true,
    };
  },
});
