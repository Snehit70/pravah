import { internalMutation, type MutationCtx } from "./_generated/server";

const IDEMPOTENCY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const IDEMPOTENCY_PURGE_BATCH_SIZE = 100;

type AutomationOperation =
  | "tasks.add"
  | "tasks.move"
  | "tasks.complete"
  | "tasks.reopen"
  | "tasks.unschedule"
  | "tasks.update"
  | "tasks.delete"
  | "tasks.linkGoal"
  | "tasks.unlinkGoal"
  | "tasks.bulkCreate"
  | "goals.create"
  | "goals.update"
  | "goals.delete"
  | "operations.undo";

export interface IdempotentMutationResult<TResult> {
  result: TResult;
  replayed: boolean;
}

interface IdempotentMutationInput<TResult> {
  ownerTokenIdentifier: string;
  idempotencyKey?: string;
  operation: AutomationOperation;
  request: unknown;
  execute: () => Promise<TResult>;
}

function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(value, (_key, nestedValue) => {
    if (
      nestedValue &&
      typeof nestedValue === "object" &&
      !Array.isArray(nestedValue)
    ) {
      return Object.fromEntries(
        Object.entries(nestedValue).sort(([left], [right]) =>
          left.localeCompare(right)
        )
      );
    }
    return nestedValue;
  });
  if (serialized === undefined) {
    throw new Error("Idempotency request and response values must be JSON serializable");
  }
  return serialized;
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

  const requestJson = canonicalJson(input.request);
  const now = Date.now();
  const existing = await ctx.db
    .query("automationIdempotencyKeys")
    .withIndex("by_owner_key", (query) =>
      query.eq("ownerTokenIdentifier", input.ownerTokenIdentifier).eq("key", key)
    )
    .first();

  if (existing) {
    if (existing.expiresAt <= now) {
      await ctx.db.delete(existing._id);
    } else {
      if (existing.operation !== input.operation || existing.requestJson !== requestJson) {
        throw new Error("Idempotency key was already used for a different request");
      }

      return {
        result: JSON.parse(existing.responseJson) as TResult,
        replayed: true,
      };
    }
  }

  const result = await input.execute();
  await ctx.db.insert("automationIdempotencyKeys", {
    ownerTokenIdentifier: input.ownerTokenIdentifier,
    key,
    operation: input.operation,
    requestJson,
    responseJson: canonicalJson(result),
    createdAt: now,
    expiresAt: now + IDEMPOTENCY_RETENTION_MS,
  });

  return { result, replayed: false };
}

export const purgeExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query("automationIdempotencyKeys")
      .withIndex("by_expires_at", (query) => query.lt("expiresAt", Date.now()))
      .take(IDEMPOTENCY_PURGE_BATCH_SIZE);

    for (const record of expired) {
      await ctx.db.delete(record._id);
    }

    return { purged: expired.length };
  },
});
