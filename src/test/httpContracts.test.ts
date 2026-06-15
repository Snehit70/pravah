import { describe, expect, it } from "vitest";
import {
  bulkRescheduleSchema,
  createTaskSchema,
  googleCalendarImportSchema,
  googleTokenExchangeSchema,
  requireApiKeyAuth,
  reviewQueueListSchema,
  taskListSchema,
  updateTaskSchema,
} from "../../convex/httpContracts";

describe("httpContracts", () => {
  describe("requireApiKeyAuth", () => {
    it("returns 500 when API key is not configured", async () => {
      const request = new Request("https://example.com/tasks", {
        headers: { "x-api-key": "any" },
      });

      const response = requireApiKeyAuth({ request, envKey: undefined });

      expect(response).not.toBeNull();
      expect(response?.status).toBe(500);
      await expect(response?.json()).resolves.toEqual({
        error: "Server configuration error: API key not configured",
      });
    });

    it("returns 401 when API key does not match", async () => {
      const request = new Request("https://example.com/tasks", {
        headers: { "x-api-key": "wrong" },
      });

      const response = requireApiKeyAuth({ request, envKey: "secret" });

      expect(response).not.toBeNull();
      expect(response?.status).toBe(401);
      await expect(response?.json()).resolves.toEqual({ error: "Unauthorized" });
    });

    it("allows request when API key matches", () => {
      const request = new Request("https://example.com/tasks", {
        headers: { "x-api-key": "secret" },
      });

      const response = requireApiKeyAuth({ request, envKey: "secret" });

      expect(response).toBeNull();
    });
  });

  describe("schemas", () => {
    it("applies defaults for task creation", () => {
      const parsed = createTaskSchema.parse({ title: "  Write docs  " });

      expect(parsed.title).toBe("Write docs");
      expect(parsed.deadline).toBeUndefined();
      expect(parsed.source).toBe("ai-agent");
    });

    it("rejects whitespace-only task titles", () => {
      expect(createTaskSchema.safeParse({ title: "   " }).success).toBe(false);
    });

    it("rejects task creation with invalid date format", () => {
      const result = createTaskSchema.safeParse({
        title: "Bad date",
        deadline: "2026/04/09",
      });

      expect(result.success).toBe(false);
    });

    it("requires valid redirectUri in google token exchange payload", () => {
      const invalid = googleTokenExchangeSchema.safeParse({
        code: "abc",
        codeVerifier: "verifier",
        redirectUri: "not-a-url",
      });
      const valid = googleTokenExchangeSchema.safeParse({
        code: "abc",
        codeVerifier: "verifier",
        redirectUri: "https://app.example.com/callback",
      });

      expect(invalid.success).toBe(false);
      expect(valid.success).toBe(true);
    });

    it("coerces review queue limit from query string", () => {
      const parsed = reviewQueueListSchema.parse({ limit: "25" });

      expect(parsed.limit).toBe(25);
    });

    it("rejects invalid task list filters", () => {
      expect(taskListSchema.safeParse({ status: "typo" }).success).toBe(false);
      expect(taskListSchema.safeParse({ date: "2026/06/04" }).success).toBe(false);
    });

    it("accepts nullable fields for bounded task updates", () => {
      const parsed = updateTaskSchema.parse({
        taskId: "task_1",
        description: null,
        deadline: null,
        estimatedMinutes: null,
        tags: null,
        priority: null,
      });

      expect(parsed).toMatchObject({
        taskId: "task_1",
        description: null,
        deadline: null,
        estimatedMinutes: null,
        tags: null,
        priority: null,
      });
    });

    it("requires at least one task id for bulk reschedule", () => {
      const result = bulkRescheduleSchema.safeParse({
        taskIds: [],
        targetDate: "2026-04-09",
      });

      expect(result.success).toBe(false);
    });

    it("accepts calendar import options for multi-calendar and full resync", () => {
      const parsed = googleCalendarImportSchema.parse({
        accessToken: "token",
        calendarIds: ["primary", "team@example.com"],
        fullResync: true,
      });

      expect(parsed.calendarIds).toEqual(["primary", "team@example.com"]);
      expect(parsed.fullResync).toBe(true);
    });
  });
});
