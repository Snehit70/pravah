import { v } from "convex/values";

export const automationScopeValidator = v.union(
  v.literal("tasks:read"),
  v.literal("tasks:write"),
  v.literal("review:read"),
  v.literal("sync:read")
);

export type AutomationScope =
  | "tasks:read"
  | "tasks:write"
  | "review:read"
  | "sync:read";
