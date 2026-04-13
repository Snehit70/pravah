import type { MutationCtx, QueryCtx } from "./_generated/server";

type AuthCtx = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }
  return identity;
}

export async function requireTokenIdentifier(ctx: AuthCtx) {
  const identity = await requireIdentity(ctx);
  return identity.tokenIdentifier;
}
