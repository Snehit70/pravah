import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  issueUploadGrant,
  reconcileUploadAttempt,
  reconcileCleanup,
  resolveTaskImage,
} from "../../convex/taskImageActions";

type Handler<TArgs, TResult> = { _handler: (ctx: unknown, args: TArgs) => Promise<TResult> };

const issueGrant = (
  issueUploadGrant as unknown as Handler<
    { uploadId: string; requestKey: string },
    Record<string, unknown>
  >
)._handler;
const resolveImage = (
  resolveTaskImage as unknown as Handler<
    { taskImageId: string; variant: "card" | "detail" },
    Record<string, unknown>
  >
)._handler;
const reconcileUpload = (
  reconcileUploadAttempt as unknown as Handler<
    { uploadId: string; attempt: number; restartAttempt?: boolean },
    Record<string, unknown>
  >
)._handler;
const cleanup = (
  reconcileCleanup as unknown as Handler<Record<string, never>, Record<string, unknown>>
)._handler;

const auth = {
  getUserIdentity: vi.fn(async () => ({ tokenIdentifier: "owner-token" })),
};

describe("Task-image grant budget boundary", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-08-09T06:00:00.000Z"));
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "public-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "server-secret");
    vi.stubEnv("CONVEX_SITE_URL", "https://befitting-swan-125.eu-west-1.convex.site");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("refreshes stale usage before signing and issues only when the fresh gate is open", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      credits: { usage: 5, limit: 25, used_percent: 20 },
      transformations: { usage: 300 },
      storage: { usage: 4_000 },
      bandwidth: { usage: 5_000 },
    }), { status: 200 })));
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce({ grantsBlocked: false, warning: false, usageTrusted: true })
      .mockResolvedValueOnce({
        uploadId: "upload-1",
        publicId: "pravah-task-images/opaque",
        issuedAt: Math.floor(Date.now() / 1000),
        encodingClass: "jpeg",
        providerAttempt: 1,
      })
      .mockResolvedValueOnce({ count: 1 });

    const result = await issueGrant({
      auth,
      runQuery: vi.fn(async () => ({
        refreshRequired: true,
        grantsBlocked: false,
        usageTrusted: true,
        snapshot: { pooledPercentage: 20 },
      })),
      runMutation,
    }, { uploadId: "upload-1", requestKey: "request-1" });

    expect(fetch).toHaveBeenCalledOnce();
    expect(runMutation).toHaveBeenCalledTimes(3);
    expect(runMutation.mock.calls[2]?.[1]).toEqual({
      category: "grant",
      code: "success",
      now: Date.now(),
    });
    expect(result).toMatchObject({ attempt: 1, cloudName: "demo-cloud", apiKey: "public-key" });
    expect(JSON.stringify(result)).not.toContain("server-secret");
  });

  it("does not prepare or sign a grant when fresh usage closes the gate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      credits: { usage: 22, limit: 25, used_percent: 88 },
      transformations: { usage: 10_000 },
      storage: { usage: 8_000_000 },
      bandwidth: { usage: 12_000_000 },
    }), { status: 200 })));
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce({ grantsBlocked: true, warning: true, usageTrusted: true })
      .mockResolvedValueOnce({ count: 1 });

    await expect(issueGrant({
      auth,
      runQuery: vi.fn(async () => ({ refreshRequired: true, grantsBlocked: false })),
      runMutation,
    }, { uploadId: "upload-1", requestKey: "request-1" })).rejects.toMatchObject({
      data: { code: "usage_blocked", retryable: true },
    });
    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(runMutation.mock.calls[1]?.[1]).toEqual({
      category: "grant",
      code: "usage_blocked",
      now: Date.now(),
    });
  });

  it("does not retry a recent failed usage refresh on every grant", async () => {
    const now = Date.now();
    vi.stubGlobal("fetch", vi.fn());
    const runMutation = vi.fn(async () => ({ count: 1 }));

    await expect(issueGrant({
      auth,
      runQuery: vi.fn(async () => ({
        refreshRequired: true,
        grantsBlocked: true,
        usageTrusted: false,
        snapshot: { lastRefreshAttemptAt: now },
      })),
      runMutation,
    }, { uploadId: "upload-1", requestKey: "request-1" })).rejects.toMatchObject({
      data: { code: "usage_blocked", retryable: true },
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps a successful grant when aggregate diagnostics are unavailable", async () => {
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce({
        uploadId: "upload-1",
        publicId: "pravah-task-images/opaque",
        issuedAt: Math.floor(Date.now() / 1000),
        encodingClass: "jpeg",
        providerAttempt: 1,
      })
      .mockRejectedValueOnce(new Error("diagnostics unavailable"));

    await expect(issueGrant({
      auth,
      runQuery: vi.fn(async () => ({
        refreshRequired: false,
        grantsBlocked: false,
        usageTrusted: true,
        snapshot: { pooledPercentage: 20 },
      })),
      runMutation,
    }, { uploadId: "upload-1", requestKey: "request-1" })).resolves.toMatchObject({ attempt: 1 });
  });

  it("keeps a successful resolution when aggregate diagnostics are unavailable", async () => {
    const runMutation = vi.fn(async () => {
      throw new Error("diagnostics unavailable");
    });

    await expect(resolveImage({
      auth,
      runMutation,
      runQuery: vi.fn(async () => ({
        kind: "ready",
        publicId: "pravah-task-images/opaque",
        version: 1,
      })),
    }, { taskImageId: "image-1", variant: "card" })).resolves.toMatchObject({ kind: "ready" });
  });

  it("fails delivery closed when canonical provider authority is unavailable", async () => {
    vi.stubEnv("CLOUDINARY_API_SECRET", "");
    const runMutation = vi.fn(async (_reference: unknown, _args: unknown) => ({ count: 1 }));

    await expect(resolveImage({
      auth,
      runMutation,
      runQuery: vi.fn(async () => ({
        kind: "ready",
        publicId: "pravah-task-images/opaque",
        version: 1,
      })),
    }, { taskImageId: "image-1", variant: "card" })).rejects.toThrow(
      "provider_unavailable"
    );
    expect(runMutation).toHaveBeenCalledOnce();
    expect(runMutation.mock.calls[0]?.[1]).toEqual({
      category: "resolution",
      code: "provider_unavailable",
      now: Date.now(),
    });
  });

  it("keeps existing fixed-variant reads available when only new grants are budget-blocked", async () => {
    const runMutation = vi.fn(async (_reference: unknown, _args: unknown) => ({ count: 1 }));

    await expect(resolveImage({
      auth,
      runMutation,
      runQuery: vi.fn(async () => ({
        kind: "ready",
        publicId: "pravah-task-images/opaque",
        version: 1,
      })),
    }, { taskImageId: "image-1", variant: "card" })).resolves.toMatchObject({
      kind: "ready",
      url: expect.stringContaining("/image/authenticated/"),
    });
    expect(runMutation.mock.calls[0]?.[1]).toMatchObject({
      category: "resolution",
      code: "success",
    });
  });

  it("recycles a present ambiguous provider attempt on explicit retry", async () => {
    const fetchMock = vi.fn(async (input: unknown) => {
      if (String(input).includes("/resources/image/authenticated")) {
        return new Response(JSON.stringify({ resources: [{ public_id: "provider-private-id" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ result: "ok" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const runMutation = vi.fn(async () => ({ reset: true }));

    await expect(reconcileUpload({
      auth,
      runQuery: vi.fn(async () => ({
        uploadId: "upload-1",
        providerPublicId: "provider-private-id",
        providerAttempt: 1,
        state: "verifying",
      })),
      runMutation,
    }, { uploadId: "upload-1", attempt: 1, restartAttempt: true })).resolves.toEqual({
      status: "absent",
      attempt: 1,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(runMutation).toHaveBeenCalledWith(
      expect.anything(),
      { ownerTokenIdentifier: "owner-token", uploadId: "upload-1", providerAttempt: 1 },
    );
  });

  it("keeps cleanup authority fail-closed and the tombstone retryable during an outage", async () => {
    vi.stubEnv("CLOUDINARY_API_SECRET", "");
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce({ promoted: 0 })
      .mockResolvedValueOnce({ count: 1 });
    const scheduler = { runAfter: vi.fn(async () => undefined) };

    await expect(cleanup({
      runMutation,
      runQuery: vi.fn(async () => [{
        _id: "tombstone-secret",
        providerPublicId: "provider-secret",
      }]),
      scheduler,
    }, {})).resolves.toMatchObject({
      inspected: 1,
      terminal: 0,
      providerUnavailable: true,
    });
    expect(runMutation).toHaveBeenCalledTimes(2);
    expect(runMutation.mock.calls[1]?.[1]).toEqual({
      category: "cleanup",
      code: "provider_unavailable",
      now: Date.now(),
    });
    expect(scheduler.runAfter).toHaveBeenCalled();
  });

  it("still schedules cleanup retries when outage diagnostics are unavailable", async () => {
    vi.stubEnv("CLOUDINARY_API_SECRET", "");
    const runMutation = vi
      .fn()
      .mockResolvedValueOnce({ promoted: 0 })
      .mockRejectedValueOnce(new Error("diagnostics unavailable"));
    const scheduler = { runAfter: vi.fn(async () => undefined) };

    await expect(cleanup({
      runMutation,
      runQuery: vi.fn(async () => [{ _id: "tombstone-secret", providerPublicId: "provider-secret" }]),
      scheduler,
    }, {})).resolves.toMatchObject({ providerUnavailable: true, retried: 0 });
    expect(scheduler.runAfter).toHaveBeenCalled();
  });
});
