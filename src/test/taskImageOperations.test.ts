import { describe, expect, it, vi } from "vitest";
import { getOperationalDiagnostics, recordOperationalEvent } from "../../convex/taskImageOperations";

type Handler<TArgs, TResult> = { _handler: (ctx: unknown, args: TArgs) => Promise<TResult> };

const diagnosticsHandler = (
  getOperationalDiagnostics as unknown as Handler<Record<string, never>, Record<string, unknown>>
)._handler;
const recordHandler = (
  recordOperationalEvent as unknown as Handler<
    { category: "grant"; code: "success"; now: number },
    { count: number }
  >
)._handler;

function queryResult(rows: unknown[]) {
  return {
    withIndex: vi.fn(() => ({
      unique: vi.fn(async () => rows[0] ?? null),
      collect: vi.fn(async () => rows),
    })),
    collect: vi.fn(async () => rows),
  };
}

describe("Task-image safe operational diagnostics", () => {
  it("increments only an aggregate category and code counter", async () => {
    const insert = vi.fn(async () => "counter-1");
    await expect(recordHandler({
      db: {
        query: vi.fn(() => queryResult([])),
        insert,
        patch: vi.fn(),
      },
    }, { category: "grant", code: "success", now: 1_000 })).resolves.toEqual({ count: 1 });
    expect(insert).toHaveBeenCalledWith("taskImageOperationalCounters", {
      key: "grant:success",
      category: "grant",
      code: "success",
      count: 1,
      updatedAt: 1_000,
    });
  });

  it("returns aggregate usage, failures, and backlogs without sensitive row context", async () => {
    const rows: Record<string, unknown[]> = {
      taskImageProviderState: [{
        key: "cloudinary",
        pooledPercentage: 71,
        transformations: 300,
        storageBytes: 4_000,
        bandwidthBytes: 5_000,
        usageObservedAt: 10_000,
        grantsBlocked: false,
      }],
      taskImageUploads: [
        {
          _id: "upload-record-secret",
          uploadId: "upload-secret",
          ownerTokenIdentifier: "owner-token",
          taskImageId: "image-secret",
          providerPublicId: "provider-secret",
          state: "ready",
        },
        {
          _id: "orphan-record-secret",
          uploadId: "orphan-upload-secret",
          ownerTokenIdentifier: "owner-token",
          providerPublicId: "orphan-provider-secret",
          state: "failed",
          safeFailureCode: "normalization_failed",
        },
      ],
      taskImageCleanupTombstones: [{
        _id: "tombstone-secret",
        ownerTokenIdentifier: "owner-token",
        providerPublicId: "cleanup-provider-secret",
        lastFailureCode: "provider_ambiguous",
      }],
      taskImageOperationalCounters: [{
        key: "verification:normalization_failed",
        category: "verification",
        code: "normalization_failed",
        count: 2,
      }],
    };
    const db = {
      query: vi.fn((table: string) => queryResult(rows[table] ?? [])),
    };

    const result = await diagnosticsHandler({
      db,
      auth: { getUserIdentity: vi.fn(async () => ({ tokenIdentifier: "owner-token" })) },
    }, {});

    expect(result).toMatchObject({
      usage: {
        pooledPercentage: 71,
        transformations: 300,
        storageBytes: 4_000,
        bandwidthBytes: 5_000,
      },
      grants: { blocked: false, warning: true },
      uploads: { ready: 1, failed: 1 },
      failures: { normalization_failed: 1 },
      backlog: { orphanedAttempts: 1, cleanup: 1 },
      events: [{ category: "verification", code: "normalization_failed", count: 2 }],
    });
    expect(JSON.stringify(result)).not.toMatch(
      /upload-secret|image-secret|provider-secret|orphan-record|orphan-upload|tombstone-secret|owner-token/
    );
  });
});
