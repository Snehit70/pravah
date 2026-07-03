import { describe, expect, it, vi } from "vitest";

import { claimLegacyData } from "../../convex/users";

type InternalHandler<TArgs, TResult> = {
  _handler: (ctx: unknown, args: TArgs) => Promise<TResult>;
};

const claimLegacyDataHandler = (
  claimLegacyData as unknown as InternalHandler<
    Record<string, never>,
    {
      claimed: boolean;
      skipped: boolean;
      counts?: Record<string, number>;
      claimedAt?: number;
    }
  >
)._handler;

function createAuthedCtx(db: unknown, tokenIdentifier = "user-1") {
  return {
    db,
    auth: {
      getUserIdentity: vi.fn().mockResolvedValue({ tokenIdentifier }),
    },
  };
}

describe("convex/users claimLegacyData", () => {
  it("claims rows missing ownerTokenIdentifier and records the migration timestamp", async () => {
    const user = { _id: "user-doc", tokenIdentifier: "user-1" };
    const tasks = [{ _id: "task-1" }, { _id: "task-2", ownerTokenIdentifier: "user-2" }];
    const integrations = [{ _id: "integration-1" }];
    const syncCursors = [{ _id: "cursor-1" }];
    const externalTaskMappings = [{ _id: "mapping-1" }];
    const reviewQueue = [{ _id: "review-1" }];
    const syncRuns = [{ _id: "run-1" }];

    const byTokenUnique = vi.fn().mockResolvedValue(user);
    const db = {
      query: vi.fn((table: string) => {
        if (table === "users") {
          return {
            withIndex: vi.fn(() => ({
              unique: byTokenUnique,
            })),
          };
        }
        const rowsByTable: Record<string, Array<Record<string, unknown>>> = {
          tasks,
          integrations,
          syncCursors,
          externalTaskMappings,
          reviewQueue,
          syncRuns,
        };
        return {
          collect: vi.fn().mockResolvedValue(rowsByTable[table] ?? []),
        };
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const now = vi.spyOn(Date, "now").mockReturnValue(1234567890);
    const result = await claimLegacyDataHandler(createAuthedCtx(db), {});

    expect(result).toEqual({
      claimed: true,
      skipped: false,
      claimedAt: 1234567890,
      counts: {
        tasks: 1,
        integrations: 1,
        syncCursors: 1,
        externalTaskMappings: 1,
        reviewQueue: 1,
        syncRuns: 1,
      },
    });
    expect(db.patch).toHaveBeenCalledWith("task-1", { ownerTokenIdentifier: "user-1" });
    expect(db.patch).toHaveBeenCalledWith("integration-1", { ownerTokenIdentifier: "user-1" });
    expect(db.patch).toHaveBeenCalledWith("cursor-1", { ownerTokenIdentifier: "user-1" });
    expect(db.patch).toHaveBeenCalledWith("mapping-1", { ownerTokenIdentifier: "user-1" });
    expect(db.patch).toHaveBeenCalledWith("review-1", { ownerTokenIdentifier: "user-1" });
    expect(db.patch).toHaveBeenCalledWith("run-1", { ownerTokenIdentifier: "user-1" });
    expect(db.patch).toHaveBeenCalledWith("user-doc", { legacyDataClaimedAt: 1234567890 });
    now.mockRestore();
  });

  it("skips the claim when the current user already completed migration", async () => {
    const db = {
      query: vi.fn((table: string) => {
        if (table !== "users") throw new Error(`unexpected table ${table}`);
        return {
          withIndex: vi.fn(() => ({
            unique: vi.fn().mockResolvedValue({
              _id: "user-doc",
              tokenIdentifier: "user-1",
              legacyDataClaimedAt: 42,
            }),
          })),
        };
      }),
      patch: vi.fn().mockResolvedValue(undefined),
    };

    const result = await claimLegacyDataHandler(createAuthedCtx(db), {});

    expect(result).toEqual({
      claimed: false,
      skipped: true,
    });
    expect(db.patch).not.toHaveBeenCalled();
  });
});
