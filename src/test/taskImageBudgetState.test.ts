import { describe, expect, it, vi } from "vitest";
import {
  getOwnerBudgetStatus,
  getUsageState,
  recordUsageRefreshFailure,
  recordUsageSnapshot,
} from "../../convex/taskImageBudget";

type Handler<TArgs, TResult> = { _handler: (ctx: unknown, args: TArgs) => Promise<TResult> };

function handler<TArgs, TResult>(value: unknown) {
  return (value as Handler<TArgs, TResult>)._handler;
}

function createStateDb() {
  let state: Record<string, unknown> | null = null;
  const db = {
    query: vi.fn(() => ({
      withIndex: vi.fn(() => ({ unique: vi.fn(async () => state) })),
    })),
    insert: vi.fn(async (_table: string, value: Record<string, unknown>) => {
      state = { _id: "provider-state", ...value };
      return "provider-state";
    }),
    patch: vi.fn(async (_id: string, value: Record<string, unknown>) => {
      state = { ...state, ...value };
    }),
  };
  return { db, read: () => state };
}

const usage = {
  transformations: 300,
  storageBytes: 4_000,
  bandwidthBytes: 5_000,
};

describe("Task-image provider usage state", () => {
  it("persists threshold hysteresis across fresh usage snapshots", async () => {
    const state = createStateDb();
    const record = handler<
      typeof usage & { pooledPercentage: number; observedAt: number },
      { grantsBlocked: boolean; warning: boolean }
    >(recordUsageSnapshot);

    await expect(record({ db: state.db }, { ...usage, pooledPercentage: 85, observedAt: 1_000 }))
      .resolves.toMatchObject({ grantsBlocked: true, warning: true });
    await expect(record({ db: state.db }, { ...usage, pooledPercentage: 80, observedAt: 2_000 }))
      .resolves.toMatchObject({ grantsBlocked: true, warning: true });
    await expect(record({ db: state.db }, { ...usage, pooledPercentage: 74.9, observedAt: 3_000 }))
      .resolves.toMatchObject({ grantsBlocked: false, warning: true });

    expect(state.read()).toMatchObject({
      key: "cloudinary",
      pooledPercentage: 74.9,
      transformations: 300,
      storageBytes: 4_000,
      bandwidthBytes: 5_000,
      usageObservedAt: 3_000,
      lastRefreshSucceededAt: 3_000,
      grantsBlocked: false,
    });
  });

  it("eventually blocks after refresh failures make the last safe snapshot untrusted", async () => {
    const state = createStateDb();
    const record = handler<
      typeof usage & { pooledPercentage: number; observedAt: number },
      unknown
    >(recordUsageSnapshot);
    const fail = handler<{ attemptedAt: number }, { grantsBlocked: boolean; usageTrusted: boolean }>(
      recordUsageRefreshFailure
    );
    await record({ db: state.db }, { ...usage, pooledPercentage: 20, observedAt: 1_000 });

    await expect(fail({ db: state.db }, { attemptedAt: 23 * 60 * 60 * 1000 }))
      .resolves.toMatchObject({ grantsBlocked: false, usageTrusted: true });
    await expect(fail({ db: state.db }, { attemptedAt: 25 * 60 * 60 * 1000 }))
      .resolves.toMatchObject({ grantsBlocked: true, usageTrusted: false });
    expect(state.read()).toMatchObject({
      grantsBlocked: true,
      lastRefreshFailureCode: "provider_usage_unavailable",
    });
  });

  it("returns only owner-safe budget status and fails closed before the first snapshot", async () => {
    const state = createStateDb();
    const readInternal = handler<{ now: number }, { grantsBlocked: boolean; usageTrusted: boolean }>(
      getUsageState
    );
    const readOwner = handler<Record<string, never>, Record<string, unknown>>(getOwnerBudgetStatus);

    await expect(readInternal({ db: state.db }, { now: 10_000 })).resolves.toMatchObject({
      grantsBlocked: true,
      usageTrusted: false,
      refreshRequired: true,
    });
    await expect(readOwner({
      db: state.db,
      auth: { getUserIdentity: vi.fn(async () => ({ tokenIdentifier: "owner" })) },
    }, {})).resolves.toEqual({
      status: "unavailable",
      warning: false,
      grantsBlocked: true,
      usage: null,
    });
  });
});
