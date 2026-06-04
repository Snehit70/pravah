import { describe, expect, it, vi } from "vitest";
import {
  callConvexApi,
  readStringArg,
  toToolArguments,
} from "../lib/automationHttpClient";

describe("automationHttpClient", () => {
  it("normalizes unknown tool arguments safely", () => {
    expect(toToolArguments(null)).toEqual({});
    expect(toToolArguments("text")).toEqual({});
    expect(toToolArguments([1, 2, 3])).toEqual({});
    expect(toToolArguments({ a: 1, b: "x" })).toEqual({ a: 1, b: "x" });
  });

  it("reads string args only when values are strings", () => {
    const args = { name: "task", count: 3, nested: { ok: true } };
    expect(readStringArg(args, "name")).toBe("task");
    expect(readStringArg(args, "count")).toBeUndefined();
    expect(readStringArg(args, "missing")).toBeUndefined();
  });

  it("throws when convex url is missing", async () => {
    await expect(
      callConvexApi({
        convexUrl: undefined,
        endpoint: "/tasks",
        method: "GET",
      })
    ).rejects.toThrow("CONVEX_URL is not configured");
  });

  it("calls convex with api key and returns parsed json", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });

    const response = await callConvexApi({
      convexUrl: "https://example.convex.site",
      endpoint: "/tasks",
      method: "POST",
      body: { title: "Task" },
      apiKey: "secret",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith("https://example.convex.site/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "secret",
      },
      body: JSON.stringify({ title: "Task" }),
    });
    expect(response).toEqual({ success: true });
  });

  it("sends bearer and idempotency headers for automation writes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, replayed: false }),
    });

    await callConvexApi({
      convexUrl: "https://example.convex.site",
      endpoint: "/tasks/complete",
      method: "POST",
      body: { taskId: "task-1" },
      bearerToken: "pravah_cred_demo",
      idempotencyKey: "complete-1",
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://example.convex.site/tasks/complete",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer pravah_cred_demo",
          "Idempotency-Key": "complete-1",
        }),
      })
    );
  });

  it("throws a descriptive error for non-ok responses", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "Unauthorized",
    });

    await expect(
      callConvexApi({
        convexUrl: "https://example.convex.site",
        endpoint: "/tasks",
        method: "GET",
        fetchImpl,
      })
    ).rejects.toThrow("Convex API GET /tasks failed (401): Unauthorized");
  });
});
