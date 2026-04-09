import type { Id } from "./_generated/dataModel";
import { z } from "zod";

export const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createTaskSchema = z.object({
  title: z.string().min(1, "Title is required").max(500, "Title too long"),
  description: z.string().max(5000, "Description too long").optional(),
  type: z.enum(["open", "deadline"]).default("open"),
  scheduledDate: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  deadline: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  source: z.enum(["manual", "ai-agent", "gmail", "gcal"]).default("ai-agent"),
  estimatedMinutes: z.number().int().positive("Estimated minutes must be positive").optional(),
  tags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
});

export const updateTaskSchema = z.object({
  taskId: z
    .string()
    .min(1, "Task ID is required")
    .transform((value) => value as Id<"tasks">),
  title: z.string().min(1, "Title cannot be empty").max(500, "Title too long").optional(),
  description: z.string().max(5000, "Description too long").optional(),
  deadline: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)").optional(),
  estimatedMinutes: z.number().int().positive("Estimated minutes must be positive").optional(),
  tags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
});

export const moveTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
  targetDate: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  position: z.number().int().min(0).optional(),
});

export const reorderTaskSchema = z.object({
  date: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
  taskIds: z.array(z.string().min(1).transform((v) => v as Id<"tasks">)).min(1, "At least one task ID required"),
});

export const completeTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
});

export const reopenTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
});

export const unscheduleTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
});

export const bulkRescheduleSchema = z.object({
  taskIds: z.array(z.string().min(1).transform((v) => v as Id<"tasks">)).min(1),
  targetDate: z.string().regex(dateRegex, "Invalid date format (YYYY-MM-DD)"),
});

export const deleteTaskSchema = z.object({
  taskId: z.string().min(1, "Task ID is required").transform((v) => v as Id<"tasks">),
});

export const googleTokenExchangeSchema = z.object({
  code: z.string().min(1, "Authorization code is required"),
  codeVerifier: z.string().min(1, "PKCE code verifier is required"),
  redirectUri: z.string().url("Invalid redirect URI"),
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
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
});

interface RequireAuthInput {
  request: Request;
  envKey: string | undefined;
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
  if (key !== envKey) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return null;
}
