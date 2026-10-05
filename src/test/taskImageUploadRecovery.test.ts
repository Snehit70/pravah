import { describe, expect, it, vi } from "vitest";

vi.mock("../../convex/_generated/server", () => ({
  internalMutation: <T>(definition: T) => definition,
  internalQuery: <T>(definition: T) => definition,
  mutation: <T>(definition: T) => definition,
  query: <T>(definition: T) => definition,
  action: <T>(definition: T) => definition,
  internalAction: <T>(definition: T) => definition,
}));

vi.mock("../../convex/authHelpers", () => ({
  requireTokenIdentifier: vi.fn(async () => "owner-a"),
}));

vi.mock("../../convex/taskImageProvider", () => ({
  buildDeliveryUrl: vi.fn(),
  buildUploadGrant: vi.fn(),
  checkProviderAssetPresence: vi.fn(async () => "present"),
  deleteProviderAsset: vi.fn(async () => "deleted"),
  fetchProviderUsage: vi.fn(),
  isCanonicalTaskImageSiteUrl: vi.fn(() => true),
  verifyProviderUploadMaster: vi.fn(),
}));

import { reconcileUploadAttempt } from "../../convex/taskImageActions";
import {
  applyUploadVerification,
  expireTaskImageUploadAttempt,
  prepareUploadGrant,
  TASK_IMAGE_UPLOAD_ATTEMPT_TIMEOUT_MS,
  TASK_IMAGE_UPLOAD_START_TIMEOUT_MS,
  TASK_IMAGE_VERIFICATION_TIMEOUT_MS,
} from "../../convex/taskImages";

type Handler<TArgs, TResult> = {
  handler: (ctx: unknown, args: TArgs) => Promise<TResult>;
};

const uploadRecord = (overrides: Record<string, unknown> = {}) => ({
  _id: "upload-record-1",
  uploadId: "upl_12345678",
  ownerTokenIdentifier: "owner-a",
  state: "uploading",
  providerAttempt: 2,
  providerPublicId: "pravah-task-images/provider-id",
  grantIssuedAt: 1_000,
  encodingClass: "jpeg",
  taskImageId: "task-image-1",
  createdAt: 0,
  updatedAt: 1_000_000,
  ...overrides,
});

function mutationContext(record: ReturnType<typeof uploadRecord>) {
  const docs = new Map<string, Record<string, unknown>>([
    [record._id, record],
    ["task-image-1", {
      _id: "task-image-1",
      state: "uploading",
      updatedAt: 1_000_000,
    }],
  ]);
  const patch = vi.fn(async (id: string, value: Record<string, unknown>) => {
    const current = docs.get(id);
    if (current) docs.set(id, { ...current, ...value });
  });
  const runAfter = vi.fn(async () => "scheduled-1");
  const ctx = {
    db: {
      get: vi.fn(async (id: string) => docs.get(id) ?? null),
      query: vi.fn(() => ({
        withIndex: vi.fn(() => ({ first: vi.fn(async () => docs.get(record._id) ?? null) })),
      })),
      patch,
    },
    scheduler: { runAfter },
  };
  return { ctx, docs, patch, runAfter };
}

describe("Task-image upload recovery", () => {
  it("schedules an attempt-scoped deadline when a provider grant is issued", async () => {
    const record = uploadRecord({ state: "claimed", providerAttempt: 1, providerPublicId: undefined, grantIssuedAt: undefined });
    const { ctx, runAfter } = mutationContext(record);
    const issuedAt = Math.floor(Date.now() / 1000);

    const result = await (prepareUploadGrant as unknown as Handler<{
      ownerTokenIdentifier: string;
      uploadId: string;
      requestKey: string;
      candidatePublicId: string;
      issuedAt: number;
    }, { providerAttempt: number }>).handler(ctx, {
      ownerTokenIdentifier: "owner-a",
      uploadId: "upl_12345678",
      requestKey: "grant_upl_12345678_attempt_1",
      candidatePublicId: "pravah-task-images/provider-id-2",
      issuedAt,
    });

    expect(result.providerAttempt).toBe(2);
    expect(runAfter).toHaveBeenCalledWith(
      TASK_IMAGE_UPLOAD_ATTEMPT_TIMEOUT_MS,
      expect.anything(),
      expect.objectContaining({
        uploadRecordId: "upload-record-1",
        providerAttempt: 2,
        expectedState: "uploading",
        expectedAt: issuedAt,
      }),
    );
  });

  it("schedules one verification deadline and does not extend it on repeated callbacks", async () => {
    const record = uploadRecord({ state: "uploading", verificationStartedAt: undefined });
    const { ctx, docs, runAfter } = mutationContext(record);
    const handler = applyUploadVerification as unknown as Handler<{
      ownerTokenIdentifier: string;
      uploadId: string;
      publicId: string;
      version: number;
      result: { status: "verifying"; master: { format: "png"; width: number; height: number; bytes: number } };
    }, { accepted: boolean; state?: string }>;
    const args = {
      ownerTokenIdentifier: "owner-a",
      uploadId: "upl_12345678",
      publicId: "pravah-task-images/provider-id",
      version: 5,
      result: { status: "verifying" as const, master: { format: "png" as const, width: 800, height: 600, bytes: 1000 } },
    };

    await handler.handler(ctx, args);
    const verificationStartedAt = docs.get(record._id)?.verificationStartedAt as number;
    expect(runAfter).toHaveBeenCalledTimes(1);
    expect(runAfter).toHaveBeenCalledWith(
      TASK_IMAGE_VERIFICATION_TIMEOUT_MS,
      expect.anything(),
      expect.objectContaining({
        uploadRecordId: record._id,
        providerAttempt: record.providerAttempt,
        expectedState: "verifying",
        expectedAt: verificationStartedAt,
      }),
    );

    await handler.handler(ctx, args);
    expect(docs.get(record._id)?.verificationStartedAt).toBe(verificationStartedAt);
    expect(runAfter).toHaveBeenCalledTimes(1);
  });

  it("expires only the exact attempt and state captured by its durable deadline", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(2_000_000 + 11 * 60_000);
      const record = uploadRecord({
        state: "verifying",
        verificationStartedAt: 2_000_000,
        providerAttempt: 3,
      });
      const { ctx, docs, patch } = mutationContext(record);
      const handler = expireTaskImageUploadAttempt as unknown as Handler<{
        uploadRecordId: string;
        providerAttempt: number;
        expectedState: "uploading" | "verifying";
        expectedAt: number;
      }, { expired: boolean }>;

      const result = await handler.handler(ctx, {
        uploadRecordId: record._id,
        providerAttempt: 3,
        expectedState: "verifying",
        expectedAt: 2_000_000,
      });

      expect(result).toMatchObject({ expired: true, failureCode: "verification_timeout" });
      expect(docs.get(record._id)).toMatchObject({ state: "failed", safeFailureCode: "verification_timeout" });
      expect(docs.get("task-image-1")).toMatchObject({
        state: "failed",
        safeFailureCode: "verification_timeout",
        failureRetryable: true,
      });
      expect(patch).toHaveBeenCalledTimes(2);

      const stale = mutationContext(uploadRecord({
        state: "verifying",
        verificationStartedAt: 2_000_001,
        providerAttempt: 4,
      }));
      await handler.handler(stale.ctx, {
        uploadRecordId: "upload-record-1",
        providerAttempt: 3,
        expectedState: "verifying",
        expectedAt: 2_000_000,
      });
      expect(stale.patch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("expires a grant that never produced a provider upload", async () => {
    vi.useFakeTimers();
    try {
      const issuedAt = Math.floor((Date.now() - TASK_IMAGE_UPLOAD_ATTEMPT_TIMEOUT_MS - 1_000) / 1_000);
      const record = uploadRecord({ state: "uploading", grantIssuedAt: issuedAt, verificationStartedAt: undefined });
      const { ctx, docs } = mutationContext(record);
      const result = await (expireTaskImageUploadAttempt as unknown as Handler<{
        uploadRecordId: string;
        providerAttempt: number;
        expectedState: "uploading" | "verifying";
        expectedAt: number;
      }, { expired: boolean; failureCode?: string }>).handler(ctx, {
        uploadRecordId: record._id,
        providerAttempt: record.providerAttempt,
        expectedState: "uploading",
        expectedAt: issuedAt,
      });

      expect(result).toEqual({ expired: true, failureCode: "upload_timeout" });
      expect(docs.get(record._id)).toMatchObject({ state: "failed", safeFailureCode: "upload_timeout" });
      expect(docs.get("task-image-1")).toMatchObject({ state: "failed", safeFailureCode: "upload_timeout", failureRetryable: true });
    } finally {
      vi.useRealTimers();
    }
  });

  it("expires a claimed image when its installation never starts the transfer", async () => {
    vi.useFakeTimers();
    try {
      const claimedAt = Date.now() - TASK_IMAGE_UPLOAD_START_TIMEOUT_MS - 1_000;
      const record = uploadRecord({
        state: "claimed",
        claimedAt,
        providerPublicId: undefined,
        grantIssuedAt: undefined,
      });
      const { ctx, docs } = mutationContext(record);
      const result = await (expireTaskImageUploadAttempt as unknown as Handler<{
        uploadRecordId: string;
        providerAttempt: number;
        expectedState: "claimed" | "uploading" | "verifying";
        expectedAt: number;
      }, { expired: boolean; failureCode?: string }>).handler(ctx, {
        uploadRecordId: record._id,
        providerAttempt: record.providerAttempt,
        expectedState: "claimed",
        expectedAt: claimedAt,
      });

      expect(result).toEqual({ expired: true, failureCode: "upload_timeout" });
      expect(docs.get(record._id)).toMatchObject({ state: "failed", safeFailureCode: "upload_timeout" });
      expect(docs.get("task-image-1")).toMatchObject({ state: "failed", safeFailureCode: "upload_timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports a persisted failure before contacting the image provider", async () => {
    const runQuery = vi.fn(async () => ({
      uploadId: "upl_12345678",
      providerPublicId: "pravah-task-images/provider-id",
      providerAttempt: 3,
      state: "failed",
      safeFailureCode: "verification_timeout",
    }));
    const result = await (reconcileUploadAttempt as unknown as Handler<{
      uploadId: string;
      attempt: number;
    }, { status: string; failure?: { code: string; retryable: boolean } }>).handler({ runQuery }, {
      uploadId: "upl_12345678",
      attempt: 3,
    });

    expect(result).toEqual({
      status: "failed",
      attempt: 3,
      failure: { code: "verification_timeout", retryable: true },
    });
  });

  it("allows an explicit retry to clear a failed record with no remaining provider object", async () => {
    const runQuery = vi.fn(async () => ({
      uploadId: "upl_12345678",
      providerAttempt: 3,
      state: "failed",
      safeFailureCode: "upload_timeout",
    }));
    const runMutation = vi.fn(async () => ({ reset: true }));
    const result = await (reconcileUploadAttempt as unknown as Handler<{
      uploadId: string;
      attempt: number;
      restartAttempt: boolean;
    }, { status: string; attempt?: number }>).handler({ runQuery, runMutation }, {
      uploadId: "upl_12345678",
      attempt: 3,
      restartAttempt: true,
    });

    expect(result).toEqual({ status: "absent", attempt: 3 });
    expect(runMutation).toHaveBeenCalledTimes(1);
  });
});
