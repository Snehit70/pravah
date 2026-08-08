import { action } from "./_generated/server";
import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { requireTokenIdentifier } from "./authHelpers";
import {
  buildDeliveryUrl,
  buildUploadGrant,
  checkProviderAssetPresence,
  verifyProviderUploadMaster,
  type ProviderUploadResult,
  type TaskImageProviderConfig,
} from "./taskImageProvider";

declare const process: { env: Record<string, string | undefined> };

const prepareUploadGrantRef = makeFunctionReference<
  "mutation",
  {
    ownerTokenIdentifier: string;
    uploadId: string;
    requestKey: string;
    candidatePublicId: string;
    issuedAt: number;
  },
  {
    uploadId: string;
    publicId: string;
    issuedAt: number;
    encodingClass: "jpeg" | "png";
    providerAttempt: number;
  }
>("taskImages:prepareUploadGrant");

const getUploadVerificationContextRef = makeFunctionReference<
  "query",
  { ownerTokenIdentifier: string; uploadId: string },
  null | {
    uploadRecordId: string;
    taskImageId: string;
    publicId: string;
    encodingClass: "jpeg" | "png";
    state: string;
  }
>("taskImages:getUploadVerificationContext");

const getUploadAttemptContextRef = makeFunctionReference<
  "query",
  { ownerTokenIdentifier: string; uploadId: string },
  null | {
    uploadId: string;
    providerPublicId?: string;
    providerAttempt: number;
    state: string;
  }
>("taskImages:getUploadAttemptContext");

const resetUploadAttemptRef = makeFunctionReference<
  "mutation",
  { ownerTokenIdentifier: string; uploadId: string; providerAttempt: number },
  { reset: boolean }
>("taskImages:resetUploadAttempt");

type VerificationMutationArgs = {
  ownerTokenIdentifier: string;
  uploadId: string;
  publicId: string;
  version: number;
  result:
    | { status: "verifying"; master: { format: "jpg" | "png"; width: number; height: number; bytes: number } }
    | {
        status: "ready";
        master: { format: "jpg" | "png"; width: number; height: number; bytes: number };
        card: { format: "webp"; width: number; height: number; bytes: number };
        detail: { format: "webp"; width: number; height: number; bytes: number };
      }
    | { status: "failed"; failureCode: string };
};

const applyUploadVerificationRef = makeFunctionReference<
  "mutation",
  VerificationMutationArgs,
  { accepted: boolean; state?: "failed" | "verifying" | "ready" }
>("taskImages:applyUploadVerification");

const getDeliveryContextRef = makeFunctionReference<
  "query",
  { ownerTokenIdentifier: string; taskImageId: string },
  | { kind: "not_found" }
  | { kind: "state"; state: string; failure?: { code: string; retryable: boolean } }
  | { kind: "ready"; publicId: string; version: number }
>("taskImages:getDeliveryContext");

const providerVariantValidator = v.object({
  transformation: v.string(),
  format: v.string(),
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
});

const providerResultArgs = {
  uploadId: v.string(),
  publicId: v.string(),
  version: v.number(),
  signature: v.string(),
  resourceType: v.string(),
  deliveryType: v.string(),
  format: v.string(),
  width: v.number(),
  height: v.number(),
  bytes: v.number(),
  eager: v.array(providerVariantValidator),
};

function readProviderConfig(): TaskImageProviderConfig {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  const siteUrl = process.env.CONVEX_SITE_URL;
  if (!cloudName || !apiKey || !apiSecret || !siteUrl || !siteUrl.startsWith("https://")) {
    throw new Error("provider_unavailable");
  }
  return {
    cloudName,
    apiKey,
    apiSecret,
    callbackUrl: `${siteUrl.replace(/\/$/, "")}/cloudinary/task-image-callback`,
  };
}

function randomProviderPublicId() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const opaque = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `pravah-task-images/${opaque}`;
}

export const issueUploadGrant = action({
  args: { uploadId: v.string(), requestKey: v.string() },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const provider = readProviderConfig();
    const prepared = await ctx.runMutation(prepareUploadGrantRef, {
      ownerTokenIdentifier,
      uploadId: args.uploadId,
      requestKey: args.requestKey,
      candidatePublicId: randomProviderPublicId(),
      issuedAt: Math.floor(Date.now() / 1000),
    });
    return {
      ...(await buildUploadGrant({
        provider,
        publicId: prepared.publicId,
        timestamp: prepared.issuedAt,
        encodingClass: prepared.encodingClass,
      })),
      attempt: prepared.providerAttempt,
    };
  },
});

export const reconcileUploadAttempt = action({
  args: { uploadId: v.string(), attempt: v.number() },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const provider = readProviderConfig();
    const context = await ctx.runQuery(getUploadAttemptContextRef, {
      ownerTokenIdentifier,
      uploadId: args.uploadId,
    });
    if (!context) return { status: "absent" as const };
    if (context.state === "ready") return { status: "ready" as const };
    if (context.providerAttempt !== args.attempt) return { status: "unknown" as const };
    if (!context.providerPublicId) return { status: "absent" as const };

    const presence = await checkProviderAssetPresence({
      provider,
      publicId: context.providerPublicId,
    });
    if (presence === "unknown") return { status: "unknown" as const };
    if (presence === "present") {
      return {
        status: context.state === "verifying" ? ("verifying" as const) : ("uploading" as const),
      };
    }
    await ctx.runMutation(resetUploadAttemptRef, {
      ownerTokenIdentifier,
      uploadId: args.uploadId,
      providerAttempt: args.attempt,
    });
    return { status: "absent" as const };
  },
});

export const submitUploadResult = action({
  args: providerResultArgs,
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const provider = readProviderConfig();
    const context = await ctx.runQuery(getUploadVerificationContextRef, {
      ownerTokenIdentifier,
      uploadId: args.uploadId,
    });
    if (!context || context.publicId !== args.publicId) throw new Error("not_found");

    const response: ProviderUploadResult = args;
    const expected = {
      apiSecret: provider.apiSecret,
      expectedPublicId: context.publicId,
      expectedEncodingClass: context.encodingClass,
    };
    // Cloudinary's upload response signature authenticates public_id and version,
    // not client-forwarded eager metadata. Only the signed webhook may attest the
    // fixed variants and transition this upload to ready.
    const verified = await verifyProviderUploadMaster(response, expected);

    if (!verified.ok) {
      await ctx.runMutation(applyUploadVerificationRef, {
        ownerTokenIdentifier,
        uploadId: args.uploadId,
        publicId: args.publicId,
        version: args.version,
        result: { status: "failed", failureCode: verified.failureCode },
      });
      return { state: "failed" as const, failure: { code: verified.failureCode } };
    }

    await ctx.runMutation(applyUploadVerificationRef, {
      ownerTokenIdentifier,
      uploadId: args.uploadId,
      publicId: args.publicId,
      version: verified.version,
      result: { status: "verifying", master: verified.master },
    });
    return { state: "verifying" as const };
  },
});

export const resolveTaskImage = action({
  args: {
    taskImageId: v.id("taskImages"),
    variant: v.union(v.literal("card"), v.literal("detail")),
  },
  handler: async (ctx, args) => {
    const ownerTokenIdentifier = await requireTokenIdentifier(ctx);
    const context = await ctx.runQuery(getDeliveryContextRef, {
      ownerTokenIdentifier,
      taskImageId: args.taskImageId,
    });
    if (context.kind !== "ready") return context;
    const provider = readProviderConfig();
    return {
      kind: "ready" as const,
      url: await buildDeliveryUrl({
        cloudName: provider.cloudName,
        apiSecret: provider.apiSecret,
        publicId: context.publicId,
        version: context.version,
        variant: args.variant,
      }),
    };
  },
});
