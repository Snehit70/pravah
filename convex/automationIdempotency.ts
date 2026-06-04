import type { MutationCtx } from "./_generated/server";

export interface IdempotentMutationResult<TResult> {
  result: TResult;
  replayed: boolean;
}

interface IdempotentMutationInput<TResult> {
  ownerTokenIdentifier: string;
  idempotencyKey?: string;
  operation: string;
  request: unknown;
  execute: () => Promise<TResult>;
}

export async function runIdempotentMutation<TResult>(
  ctx: MutationCtx,
  input: IdempotentMutationInput<TResult>
): Promise<IdempotentMutationResult<TResult>> {
  if (!input.idempotencyKey) {
    return {
      result: await input.execute(),
      replayed: false,
    };
  }

  const key = input.idempotencyKey.trim();
  if (!key || key.length > 200) {
    throw new Error("Idempotency key must be between 1 and 200 characters");
  }

  const requestJson = JSON.stringify(input.request);
  const existing = await ctx.db
    .query("automationIdempotencyKeys")
    .withIndex("by_owner_key", (query) =>
      query.eq("ownerTokenIdentifier", input.ownerTokenIdentifier).eq("key", key)
    )
    .first();

  if (existing) {
    if (existing.operation !== input.operation || existing.requestJson !== requestJson) {
      throw new Error("Idempotency key was already used for a different request");
    }

    return {
      result: JSON.parse(existing.responseJson) as TResult,
      replayed: true,
    };
  }

  const result = await input.execute();
  await ctx.db.insert("automationIdempotencyKeys", {
    ownerTokenIdentifier: input.ownerTokenIdentifier,
    key,
    operation: input.operation,
    requestJson,
    responseJson: JSON.stringify(result),
    createdAt: Date.now(),
  });

  return { result, replayed: false };
}
