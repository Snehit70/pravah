import { listGoalLinksForOwner, listGoalTasksForOwner } from "./goalLinkQueries";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import { internalMutation, mutation } from "./writeServer";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { requireTokenIdentifier } from "./authHelpers";

export type GoalDedupeCandidate = {
  _id: string;
  ownerTokenIdentifier: string;
  clientId: string;
  createdAt: number;
};

/**
 * Split goal rows into the ones to keep and the ones to delete so that each
 * (ownerTokenIdentifier, clientId) pair survives exactly once.
 *
 * Convex indexes are not unique, so a read-then-insert pair that races inserts
 * two rows with the same clientId: the inserts target different document ids,
 * so OCC sees no conflict on a shared document and lets both commit.
 *
 * `goals.upsert` patches whichever row the index returns first, which is the
 * first-inserted row, so the oldest row also holds the current field values.
 * `createdAt` then `_id` picks a deterministic winner when timestamps tie.
 * Grouping is per owner, so the same clientId under two owners is left alone.
 */
export function selectCanonicalGoalRows<T extends GoalDedupeCandidate>(
  rows: T[],
): { keep: T[]; remove: T[] } {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.ownerTokenIdentifier}\u0000${row.clientId}`;
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }

  const keep: T[] = [];
  const remove: T[] = [];
  for (const group of grouped.values()) {
    const ordered = [...group].sort(
      (a, b) => a.createdAt - b.createdAt || a._id.localeCompare(b._id),
    );
    const [winner, ...losers] = ordered;
    if (winner) keep.push(winner);
    remove.push(...losers);
  }
  return { keep, remove };
}

export async function updateGoalForOwner(
  ctx: MutationCtx,
  ownerTokenIdentifier: string,
  goalClientId: string,
  patch: {
    description?: string | null;
    deadline?: string | null;
    priority?: "p1" | "p2" | "p3" | null;
  }
): Promise<{ updated: boolean }> {
  const existing = await ctx.db
    .query("goals")
    .withIndex("by_owner_client_id", (q) =>
      q.eq("ownerTokenIdentifier", ownerTokenIdentifier).eq("clientId", goalClientId),
    )
    .first();
  if (!existing) return { updated: false };

  const updates: Partial<{
    description: string | undefined;
    deadline: string | undefined;
    priority: "p1" | "p2" | "p3" | undefined;
    updatedAt: number;
  }> = {};

  if (Object.prototype.hasOwnProperty.call(patch, "description")) {
    updates.description = patch.description ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "deadline")) {
    updates.deadline = patch.deadline ?? undefined;
  }
  if (Object.prototype.hasOwnProperty.call(patch, "priority")) {
    updates.priority = patch.priority ?? undefined;
  }

  await ctx.db.patch(existing._id, { ...updates, updatedAt: Date.now() });
  return { updated: true };
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const rows = await ctx.db
      .query("goals")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect();
    return rows.map((r) => ({
      id: r.clientId,
      text: r.text,
      description: r.description,
      deadline: r.deadline,
      priority: r.priority,
      createdAt: r.createdAt,
    }));
  },
});

export const listTasks = query({
  args: {goalClientId: v.string(), paginationOpts: paginationOptsValidator},
  handler: async (ctx, args) => {
    const result = await listGoalTasksForOwner(ctx, await requireTokenIdentifier(ctx), args.goalClientId, args.paginationOpts);
    return {page: result.tasks, isDone: result.isDone, continueCursor: result.continueCursor};
  },
});

export const upsert = mutation({
  args: {
    clientId: v.string(),
    text: v.string(),
    description: v.optional(v.string()),
    deadline: v.optional(v.string()),
    priority: v.optional(v.union(v.literal("p1"), v.literal("p2"), v.literal("p3"))),
    createdAt: v.number(),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_owner_client_id", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("clientId", args.clientId),
      )
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        text: args.text,
        description: args.description,
        deadline: args.deadline,
        priority: args.priority,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("goals", {
        clientId: args.clientId,
        text: args.text,
        description: args.description,
        deadline: args.deadline,
        priority: args.priority,
        ownerTokenIdentifier: tokenIdentifier,
        createdAt: args.createdAt,
        updatedAt: now,
      });
    }
  },
});

export const bulkUpsert = mutation({
  args: {
    goals: v.array(
      v.object({
        clientId: v.string(),
        text: v.string(),
        description: v.optional(v.string()),
        deadline: v.optional(v.string()),
        priority: v.optional(v.union(v.literal("p1"), v.literal("p2"), v.literal("p3"))),
        createdAt: v.number(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const existingRows = await ctx.db
      .query("goals")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect();

    const { keep, remove: duplicates } = selectCanonicalGoalRows(existingRows);
    for (const row of duplicates) await ctx.db.delete(row._id);

    const idByClientId = new Map<string, Id<"goals">>();
    for (const row of keep) idByClientId.set(row.clientId, row._id);

    const now = Date.now();
    let inserted = 0;
    let updated = 0;
    for (const goal of args.goals) {
      const existingId = idByClientId.get(goal.clientId);
      if (existingId) {
        await ctx.db.patch(existingId, {
          text: goal.text,
          description: goal.description,
          deadline: goal.deadline,
          priority: goal.priority,
          updatedAt: now,
        });
        updated += 1;
        continue;
      }
      const id = await ctx.db.insert("goals", {
        clientId: goal.clientId,
        text: goal.text,
        description: goal.description,
        deadline: goal.deadline,
        priority: goal.priority,
        ownerTokenIdentifier: tokenIdentifier,
        createdAt: goal.createdAt,
        updatedAt: now,
      });
      // Registering the new id is what makes a repeated clientId inside one
      // request patch the row just inserted instead of inserting a twin.
      idByClientId.set(goal.clientId, id);
      inserted += 1;
    }

    return { inserted, updated, deduped: duplicates.length };
  },
});

export const dedupe = internalMutation({
  args: {
    ownerTokenIdentifier: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owner = args.ownerTokenIdentifier;
    const rows = owner
      ? await ctx.db
          .query("goals")
          .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", owner))
          .collect()
      : await ctx.db.query("goals").collect();

    const { keep, remove } = selectCanonicalGoalRows(rows);
    if (args.dryRun !== true) {
      for (const row of remove) await ctx.db.delete(row._id);
    }
    return {
      scanned: rows.length,
      kept: keep.length,
      removed: remove.length,
      dryRun: args.dryRun === true,
      removedClientIds: remove.map((row) => row.clientId),
    };
  },
});

export const remove = mutation({
  args: { clientId: v.string() },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_owner_client_id", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("clientId", args.clientId),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
    const links = await ctx.db
      .query("goalLinks")
      .withIndex("by_owner_goal", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("goalClientId", args.clientId),
      )
      .collect();
    for (const link of links) await ctx.db.delete(link._id);
  },
});

export const listLinks = query({
  args: { taskIds: v.optional(v.array(v.string())) },
  handler: async (ctx, { taskIds }) => {
    const owner = await requireTokenIdentifier(ctx);
    return listGoalLinksForOwner(ctx, owner, taskIds);
  },
});

export const setLink = mutation({
  args: {
    taskId: v.string(),
    goalClientId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const existing = await ctx.db
      .query("goalLinks")
      .withIndex("by_owner_task", (q) =>
        q.eq("ownerTokenIdentifier", tokenIdentifier).eq("taskId", args.taskId),
      )
      .first();
    if (args.goalClientId == null) {
      if (existing) await ctx.db.delete(existing._id);
    } else if (existing) {
      await ctx.db.patch(existing._id, { goalClientId: args.goalClientId });
    } else {
      await ctx.db.insert("goalLinks", {
        taskId: args.taskId,
        goalClientId: args.goalClientId,
        ownerTokenIdentifier: tokenIdentifier,
      });
    }
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect();
    for (const g of goals) await ctx.db.delete(g._id);
    const links = await ctx.db
      .query("goalLinks")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect();
    for (const l of links) await ctx.db.delete(l._id);
  },
});
