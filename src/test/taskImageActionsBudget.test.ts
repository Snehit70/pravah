import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { issueUploadGrant, resolveTaskImage } from "../../convex/taskImageActions";

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

const auth = {
  getUserIdentity: vi.fn(async () => ({ tokenIdentifier: "owner-token" })),
};

describe("Task-image grant budget boundary", () => {
  beforeEach(() => {
    vi.setSystemTime(new Date("2026-08-09T06:00:00.000Z"));
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "demo-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "public-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "server-secret");
    vi.stubEnv("CONVEX_SITE_URL", "https://befitting-swan-125.convex.site");
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
      });

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
    expect(runMutation).toHaveBeenCalledTimes(2);
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
    const runMutation = vi.fn(async () => ({
      grantsBlocked: true,
      warning: true,
      usageTrusted: true,
    }));

    await expect(issueGrant({
      auth,
      runQuery: vi.fn(async () => ({ refreshRequired: true, grantsBlocked: false })),
      runMutation,
    }, { uploadId: "upload-1", requestKey: "request-1" })).rejects.toThrow(
      "task_image_grants_blocked"
    );
    expect(runMutation).toHaveBeenCalledOnce();
  });

  it("fails delivery closed when canonical provider authority is unavailable", async () => {
    vi.stubEnv("CLOUDINARY_API_SECRET", "");

    await expect(resolveImage({
      auth,
      runQuery: vi.fn(async () => ({
        kind: "ready",
        publicId: "pravah-task-images/opaque",
        version: 1,
      })),
    }, { taskImageId: "image-1", variant: "card" })).rejects.toThrow(
      "provider_unavailable"
    );
  });
});
