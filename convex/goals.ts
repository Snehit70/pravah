import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireTokenIdentifier } from "./authHelpers";

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
  args: {},
  handler: async (ctx) => {
    const tokenIdentifier = await requireTokenIdentifier(ctx);
    const links = await ctx.db
      .query("goalLinks")
      .withIndex("by_owner", (q) => q.eq("ownerTokenIdentifier", tokenIdentifier))
      .collect();
    const result: Record<string, string> = {};
    for (const link of links) {
      result[link.taskId] = link.goalClientId;
    }
    return result;
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
