import { describe, expect, it, vi } from "vitest";
import type { MutationCtx } from "../../convex/_generated/server";
import { runIdempotentMutation } from "../../convex/automationIdempotency";

function createCtx(existing?: {
  _id?: string;
  operation: string;
  requestJson: string;
  responseJson: string;
  expiresAt?: number;
}) {
  const first = vi.fn().mockResolvedValue(
    existing
      ? {
          _id: existing._id ?? "idempotency_existing",
          expiresAt: existing.expiresAt ?? Date.now() + 60_000,
          ...existing,
        }
      : null
  );
  const withIndex = vi.fn().mockReturnValue({ first });
  const query = vi.fn().mockReturnValue({ withIndex });
  const insert = vi.fn().mockResolvedValue("idempotency_1");
  const deleteRecord = vi.fn().mockResolvedValue(undefined);

  return {
    ctx: { db: { query, insert, delete: deleteRecord } } as unknown as MutationCtx,
    first,
    insert,
    deleteRecord,
  };
}

describe("runIdempotentMutation", () => {
  it("stores the result for a new key", async () => {
    const { ctx, insert } = createCtx();
    const execute = vi.fn().mockResolvedValue({ success: true });

    const result = await runIdempotentMutation(ctx, {
      ownerTokenIdentifier: "user-1",
      idempotencyKey: "move-1",
      operation: "tasks.move",
      request: { taskId: "task-1", targetDate: "2026-06-05" },
      execute,
    });

    expect(result).toEqual({ result: { success: true }, replayed: false });
    expect(execute).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(
      "automationIdempotencyKeys",
      expect.objectContaining({
        ownerTokenIdentifier: "user-1",
        key: "move-1",
        operation: "tasks.move",
        responseJson: JSON.stringify({ success: true }),
      })
    );
  });

  it("replays the stored result for an identical request", async () => {
    const request = { taskId: "task-1" };
    const { ctx, insert } = createCtx({
      operation: "tasks.complete",
      requestJson: JSON.stringify(request),
      responseJson: JSON.stringify({ success: true }),
    });
    const execute = vi.fn();

    const result = await runIdempotentMutation(ctx, {
      ownerTokenIdentifier: "user-1",
      idempotencyKey: "complete-1",
      operation: "tasks.complete",
      request,
      execute,
    });

    expect(result).toEqual({ result: { success: true }, replayed: true });
    expect(execute).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("treats equivalent object key order as the same request", async () => {
    const { ctx } = createCtx({
      operation: "tasks.move",
      requestJson: JSON.stringify({ position: 0, taskId: "task-1" }),
      responseJson: JSON.stringify({ success: true }),
    });

    await expect(
      runIdempotentMutation(ctx, {
        ownerTokenIdentifier: "user-1",
        idempotencyKey: "move-1",
        operation: "tasks.move",
        request: { taskId: "task-1", position: 0 },
        execute: vi.fn(),
      })
    ).resolves.toEqual({ result: { success: true }, replayed: true });
  });

  it("rejects reuse of a key for different input", async () => {
    const { ctx } = createCtx({
      operation: "tasks.complete",
      requestJson: JSON.stringify({ taskId: "task-1" }),
      responseJson: JSON.stringify({ success: true }),
    });

    await expect(
      runIdempotentMutation(ctx, {
        ownerTokenIdentifier: "user-1",
        idempotencyKey: "complete-1",
        operation: "tasks.complete",
        request: { taskId: "task-2" },
        execute: vi.fn(),
      })
    ).rejects.toThrow("Idempotency key was already used for a different request");
  });

  it("executes directly when a legacy caller omits the key", async () => {
    const { ctx, first, insert } = createCtx();
    const execute = vi.fn().mockResolvedValue({ success: true });

    await expect(
      runIdempotentMutation(ctx, {
        ownerTokenIdentifier: "user-1",
        operation: "tasks.complete",
        request: { taskId: "task-1" },
        execute,
      })
    ).resolves.toEqual({ result: { success: true }, replayed: false });

    expect(first).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("reuses an expired key as a new request", async () => {
    const { ctx, deleteRecord, insert } = createCtx({
      _id: "expired-1",
      operation: "tasks.complete",
      requestJson: JSON.stringify({ taskId: "task-1" }),
      responseJson: JSON.stringify({ success: true }),
      expiresAt: Date.now() - 1,
    });
    const execute = vi.fn().mockResolvedValue({ success: true });

    await expect(
      runIdempotentMutation(ctx, {
        ownerTokenIdentifier: "user-1",
        idempotencyKey: "complete-1",
        operation: "tasks.complete",
        request: { taskId: "task-1" },
        execute,
      })
    ).resolves.toEqual({ result: { success: true }, replayed: false });

    expect(deleteRecord).toHaveBeenCalledWith("expired-1");
    expect(insert).toHaveBeenCalledOnce();
  });
});
