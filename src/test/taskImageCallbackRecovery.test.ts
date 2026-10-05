import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("../../convex/_generated/server", () => ({
  internalMutation: (definition: unknown) => definition,
  internalQuery: (definition: unknown) => definition,
  mutation: (definition: unknown) => definition,
  query: (definition: unknown) => definition,
  action: (definition: unknown) => definition,
  internalAction: (definition: unknown) => definition,
}));
vi.mock("../../convex/authHelpers", () => ({
  requireTokenIdentifier: async () => "owner",
}));
import {
  applyUploadVerification,
  getUploadByProviderPublicId,
  getUploadAttemptContext,
  markUploadFailed,
  reserveProviderReconciliation,
  storeEagerNotification,
} from "../../convex/taskImages";
import {
  reconcileUploadAttempt,
  verifyPendingEager,
} from "../../convex/taskImageActions";
import {
  CARD_TRANSFORMATION,
  DETAIL_TRANSFORMATION,
} from "../../convex/taskImageProvider";
import { getFunctionName } from "convex/server";

// This harness runs the real mutations/action against shared state and a scheduler
// queue, so either callback ordering must end at the same sealed success.
function harness() {
  const upload: Record<string, unknown> = {
    _id: "record",
    uploadId: "upl_test",
    ownerTokenIdentifier: "owner",
    providerPublicId: "public",
    encodingClass: "jpeg",
    state: "uploading",
    providerAttempt: 2,
  };
  const queue: Array<{ name: string; args: unknown }> = [];
  const ctx = {
    db: {
      query: () => ({ withIndex: () => ({ first: async () => upload }) }),
      patch: async (_id: string, value: Record<string, unknown>) =>
        Object.assign(upload, value),
    },
    scheduler: {
      runAfter: async (_ms: number, ref: never, args: unknown) => {
        queue.push({ name: getFunctionName(ref), args });
      },
    },
    runQuery: async (ref: never, args: never) =>
      run(
        getFunctionName(ref) === "taskImages:getUploadAttemptContext"
          ? getUploadAttemptContext
          : getUploadByProviderPublicId,
        ctx,
        args,
      ),
    runMutation: async (ref: never, args: never) =>
      run(
        getFunctionName(ref) === "taskImages:reserveProviderReconciliation"
          ? reserveProviderReconciliation
          : applyUploadVerification,
        ctx,
        args,
      ),
  };
  async function drain() {
    while (queue.length) {
      const item = queue.shift()!;
      if (item.name === "taskImageActions:verifyPendingEager")
        await run(verifyPendingEager, ctx, item.args);
    }
  }
  return { upload, ctx, drain };
}
function run(definition: unknown, ctx: unknown, args: unknown) {
  return (
    definition as { handler: (ctx: unknown, args: unknown) => Promise<unknown> }
  ).handler(ctx, args);
}
const eager = [
  {
    transformation: CARD_TRANSFORMATION,
    format: "webp",
    width: 640,
    height: 480,
    bytes: 100_000,
  },
  {
    transformation: DETAIL_TRANSFORMATION,
    format: "webp",
    width: 1600,
    height: 1200,
    bytes: 300_000,
  },
];
const master = { format: "jpg", width: 1920, height: 1440, bytes: 900_000 };
const receipt = {
  ownerTokenIdentifier: "owner",
  uploadId: "upl_test",
  publicId: "public",
  version: 123,
  result: { status: "verifying", master },
};

beforeEach(() => {
  vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test");
  vi.stubEnv("CLOUDINARY_API_KEY", "test");
  vi.stubEnv("CLOUDINARY_API_SECRET", "test");
  vi.stubEnv(
    "CONVEX_SITE_URL",
    "https://combative-zebra-261.eu-west-1.convex.site",
  );
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("durable callback joining", () => {
  it.each([true, false])(
    "seals success with eager-first=%s, including duplicate callbacks",
    async (eagerFirst) => {
      const { upload, ctx, drain } = harness();
      const notification = { publicId: "public", version: 123, eager };
      if (eagerFirst) {
        await run(storeEagerNotification, ctx, notification);
        await drain();
        expect(upload.state).toBe("uploading");
      }
      await run(applyUploadVerification, ctx, receipt);
      if (!eagerFirst) await run(storeEagerNotification, ctx, notification);
      await drain();
      expect(upload.state).toBe("ready");
      expect(upload.pendingEager).toBeUndefined();
      await run(storeEagerNotification, ctx, notification);
      await run(applyUploadVerification, ctx, {
        ...receipt,
        result: { status: "failed", failureCode: "upload_failed" },
      });
      expect(upload.state).toBe("ready");
    },
  );
  it("does not delete a received image on retry when processing is still pending", async () => {
    const { ctx, upload } = harness();
    upload.state = "failed";
    upload.safeFailureCode = "upload_timeout";
    const fetch = vi.fn(async () =>
      Response.json({
        public_id: "public",
        version: 123,
        resource_type: "image",
        type: "authenticated",
        format: "jpg",
        width: 1920,
        height: 1440,
        bytes: 900_000,
        derived: [],
      }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(
      await run(reconcileUploadAttempt, ctx, {
        uploadId: "upl_test",
        attempt: 2,
        restartAttempt: true,
      }),
    ).toEqual({ status: "verifying", attempt: 2 });
    expect(upload.providerPublicId).toBe("public");
    expect(upload.state).toBe("verifying");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("ignores a late failure from an older native attempt", async () => {
    const { ctx, upload } = harness();
    expect(
      await run(markUploadFailed, ctx, {
        uploadId: "upl_test",
        attempt: 1,
        failureCode: "upload_failed",
      }),
    ).toEqual({ accepted: false });
    expect(upload.state).toBe("uploading");
  });
  it("does not accept eager metadata for a different provider version", async () => {
    const { ctx, upload, drain } = harness();
    await run(applyUploadVerification, ctx, receipt);
    await run(storeEagerNotification, ctx, {
      publicId: "public",
      version: 122,
      eager,
    });
    await drain();
    expect(upload.state).toBe("verifying");
  });
  it("bounds provider recovery across concurrent callers", async () => {
    const { ctx } = harness();
    const args = {
      ownerTokenIdentifier: "owner",
      uploadId: "upl_test",
      publicId: "public",
    };
    expect(await run(reserveProviderReconciliation, ctx, args)).toBe(true);
    expect(await run(reserveProviderReconciliation, ctx, args)).toBe(false);
  });
});
