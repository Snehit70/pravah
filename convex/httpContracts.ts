import type { Id } from "./_generated/dataModel";
import { z } from "zod";

export const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
const operationGroupId = z.string().min(1).max(200).optional();

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().max(5000, "Description too long").optional(),
  deadline: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  source: z.enum(["manual", "ai-agent", "gmail", "gcal"]).default("ai-agent"),
  estimatedMinutes: z.number().int().positive("Estimated minutes must be positive").optional(),
  tags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
  priority: z.enum(["p1", "p2", "p3"]).optional(),
  operationGroupId,
});

export const taskListSchema = z.object({
  date: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  status: z.enum(["inbox", "timeline", "scheduled", "completed", "cancelled"]).optional(),
});

export const updateTaskSchema = z.object({
  taskId: z
    .string()
    .min(1, "Task ID is required")
    .transform((value) => value as Id<"tasks">),
  title: z.string().min(1, "Title cannot be empty").max(500, "Title too long").optional(),
  description: z.string().max(5000, "Description too long").optional().nullable(),
  deadline: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional().nullable(),
  estimatedMinutes: z.number().int().positive("Estimated minutes must be positive").optional().nullable(),
  tags: z.array(z.string().max(50)).max(20, "Too many tags").optional().nullable(),
  priority: z.enum(["p1", "p2", "p3"]).optional().nullable(),
  operationGroupId,
});

export const moveTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
  targetDate: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  position: z.number().int().min(0).optional(),
  operationGroupId,
});

export const reorderTaskSchema = z.object({
  date: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  taskIds: z.array(z.string().min(1).transform((v) => v as Id<"tasks">)).min(1, "At least one task ID required"),
});

export const completeTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
  operationGroupId,
});

export const reopenTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
  operationGroupId,
});

export const unscheduleTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
  operationGroupId,
});

export const bulkRescheduleSchema = z.object({
  taskIds: z.array(z.string().min(1).transform((v) => v as Id<"tasks">)).min(1),
  targetDate: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
});

export const deleteTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
  confirmTaskDelete: z.boolean().optional(),
  operationGroupId,
});

export const updateGoalSchema = z.object({
  goalId: z.string().min(1, "Goal ID is required"),
  description: z.string().max(1000).optional().nullable(),
  deadline: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional().nullable(),
  priority: z.enum(["p1", "p2", "p3"]).optional().nullable(),
  operationGroupId,
});

export const createGoalSchema = z.object({
  clientId: z.string().min(1).max(200).optional(),
  text: z.string().trim().min(1, "Goal text is required").max(500),
  description: z.string().max(1000).optional(),
  deadline: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  priority: z.enum(["p1", "p2", "p3"]).optional(),
  operationGroupId,
});

export const deleteGoalSchema = z.object({
  goalId: z.string().min(1, "Goal ID is required"),
  confirmGoalDelete: z.boolean().optional(),
  operationGroupId,
});

export const setGoalLinkSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
  goalId: z.string().min(1, "Goal ID is required").nullable(),
  operationGroupId,
});

export const operationListSchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
  operationGroupId: z.string().min(1).max(200).optional(),
});

export const operationUndoSchema = z.object({
  operationId: z.string().min(1).optional(),
  operationGroupId: z.string().min(1).max(200).optional(),
});

export const googleTokenExchangeSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  codeVerifier: z.string().min(1, "PKCE code verifier is required"),
  redirectUri: z.string().url("Invalid redirect URI"),
});

export const automationBootstrapExchangeSchema = z.object({
  bootstrapToken: z.string().min(1, "Bootstrap token is required"),
});

export const syncStatusSchema = z.object({
  provider: z.enum(["google_calendar", "gmail"]).default("google_calendar"),
});

export const reviewQueueListSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
});

export const reviewApproveSchema = z.object({
  reviewId: z.string().min(1, "Review ID is required").transform((v) => v as Id<"reviewQueue">),
  scheduledDate: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
});

export const reviewRejectSchema = z.object({
  reviewId: z.string().min(1, "Review ID is required").transform((v) => v as Id<"reviewQueue">),
  reason: z.string().max(500).optional(),
});

export const gmailCandidateSchema = z.object({
  externalId: z.string().min(1, "External ID is required"),
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().max(5000).optional(),
  deadline: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  estimatedMinutes: z.number().int().positive().optional(),
  tags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
  payloadJson: z.string().max(20000).optional(),
});

export const googleCalendarImportSchema = z.object({
  accessToken: z.string().min(1, "Access token is required"),
  tokenExpiresAt: z.number().int().positive().optional(),
  calendarId: z.string().optional(),
  calendarIds: z.array(z.string().min(1)).max(100).optional(),
  fullResync: z.boolean().optional(),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
});

interface RequireAuthInput {
  request: Request;
  envKey: string | undefined;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function requireApiKeyAuth({ request, envKey }: RequireAuthInput): Response | null {
  if (!envKey) {
    return new Response(
      JSON.stringify({ error: "Server configuration error: API key not configured" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const key = request.headers.get("x-api-key");
  if (!key || !constantTimeEquals(key, envKey)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
