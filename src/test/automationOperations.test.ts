import { describe, expect, it, vi } from "vitest";

vi.mock("../../convex/_generated/server", () => ({
  internalMutation: <T>(definition: T) => definition,
  internalQuery: <T>(definition: T) => definition,
}));

import type { MutationCtx } from "../../convex/_generated/server";
import { undo } from "../../convex/automationOperations";

function makeQuery(dbState: {
  operation: Record<string, unknown> | null;
  tasks: Array<Record<string, unknown>>;
}) {
  return (table: string) => ({
    withIndex: (
      index: string,
      builder: (query: { eq: (field: string, value: unknown) => { eq: (field: string, value: unknown) => unknown } }) => unknown
    ) => {
      const chain = {
        eq: () => chain,
      };
      builder(chain);
      if (table === "automationOperations" && index === "by_owner_operation_id") {
        return {
          first: vi.fn().mockResolvedValue(dbState.operation),
        };
      }
      if (table === "tasks" && index === "by_owner_position") {
        return {
          collect: vi.fn().mockResolvedValue(dbState.tasks),
        };
      }
      return {
        first: vi.fn().mockResolvedValue(null),
        collect: vi.fn().mockResolvedValue([]),
      };
    },
  });
}

describe("automationOperations.undo", () => {
  it("allocates a fresh timeline position when restoring an active task snapshot", async () => {
    const dbState = {
      operation: {
        _id: "operation_doc_1",
        ownerTokenIdentifier: "user-1",
        operationId: "op_1",
        status: "applied",
        undoExpiresAt: Date.now() + 60_000,
        beforeJson: JSON.stringify({
          tasks: [
            {
              _id: "task_restore",
              title: "Restored task",
              deadline: "2026-06-20",
              position: 1,
              completedAt: undefined,
              cancelledAt: undefined,
            },
          ],
        }),
        afterJson: JSON.stringify({
          tasks: [
            {
              _id: "task_restore",
              title: "Restored task",
              deadline: "2026-06-20",
              position: 1,
              completedAt: Date.now(),
            },
          ],
        }),
      },
      tasks: [
        {
          _id: "task_restore",
          ownerTokenIdentifier: "user-1",
          deadline: "2026-06-20",
          position: 1,
          completedAt: Date.now(),
          cancelledAt: undefined,
        },
        {
          _id: "task_active",
          ownerTokenIdentifier: "user-1",
          deadline: "2026-06-20",
          position: 1,
          completedAt: undefined,
          cancelledAt: undefined,
        },
      ],
    };

    const get = vi.fn().mockImplementation(async (id: string) => {
      if (id === "task_restore") {
        return {
          _id: "task_restore",
          ownerTokenIdentifier: "user-1",
          title: "Restored task",
          description: undefined,
          deadline: "2026-06-20",
          scheduledAt: undefined,
          completedAt: Date.now(),
          position: 1,
          source: "manual",
          estimatedMinutes: undefined,
          tags: undefined,
          priority: undefined,
          cancelledAt: undefined,
        };
      }
      return null;
    });
    const patch = vi.fn().mockResolvedValue(undefined);

    const ctx = {
      db: {
        get,
        patch,
        query: makeQuery(dbState),
      },
    } as unknown as MutationCtx;

    const result = await undo.handler(ctx, {
      ownerTokenIdentifier: "user-1",
      operationId: "op_1",
    });

    expect(result).toMatchObject({
      result: { undone: ["op_1"] },
      replayed: false,
    });
    expect(patch).toHaveBeenCalledWith(
      "task_restore",
      expect.objectContaining({
        deadline: "2026-06-20",
        position: 2,
        completedAt: undefined,
        cancelledAt: undefined,
      })
    );
  });
});
