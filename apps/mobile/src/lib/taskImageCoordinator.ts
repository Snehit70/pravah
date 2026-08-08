export type TaskImageSourceKind = "photos" | "camera" | "paste";
export type TaskImageState =
  | "preparing"
  | "pending"
  | "uploading"
  | "verifying"
  | "ready"
  | "failed";

export type SafeTaskImageFailure = {
  code: string;
  retryable: boolean;
};

export type AcquiredTaskImageSource = {
  kind: TaskImageSourceKind;
  uri: string;
  previewUri: string;
};

export type NormalizedTaskImage = {
  uri: string;
  previewUri: string;
  encodingClass: "jpeg" | "png";
  width: number;
  height: number;
  bytes: number;
};

export type TaskImageUploadGrant = {
  uploadUrl: string;
  signature: string;
  apiKey: string;
  signedParameters: Record<string, string>;
};

export type AllowlistedProviderResult = {
  publicId: string;
  version: number;
  signature: string;
  resourceType: string;
  deliveryType: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  eager: Array<{
    transformation: string;
    format: string;
    width: number;
    height: number;
    bytes: number;
  }>;
};

export type TaskImageCoordinatorDependencies = {
  createUploadId: () => string;
  acquireSource: (kind: TaskImageSourceKind) => Promise<AcquiredTaskImageSource>;
  normalize: (source: AcquiredTaskImageSource) => Promise<NormalizedTaskImage>;
  stage: (image: {
    uploadId: string;
    encodingClass: "jpeg" | "png";
    width: number;
    height: number;
    bytes: number;
  }) => Promise<void>;
  issueGrant: (args: { uploadId: string; requestKey: string }) => Promise<TaskImageUploadGrant>;
  upload: (uri: string, grant: TaskImageUploadGrant) => Promise<AllowlistedProviderResult & Record<string, unknown>>;
  verify: (result: { uploadId: string } & AllowlistedProviderResult) => Promise<{
    state: "verifying" | "ready" | "failed";
    failure?: { code: string };
  }>;
};

type Draft = {
  uploadId: string;
  state: TaskImageState;
  previewUri?: string;
  normalized?: NormalizedTaskImage;
  failure?: SafeTaskImageFailure;
};

const SAFE_FAILURE_CODES = new Set([
  "unsupported_format",
  "animated_image",
  "source_too_large",
  "dimensions_too_large",
  "aspect_ratio_unsupported",
  "clipboard_too_large",
  "storage_unavailable",
  "memory_unavailable",
  "normalization_failed",
  "master_too_large",
  "variant_too_large",
  "source_unavailable",
]);

const NON_RETRYABLE_FAILURES = new Set([
  "unsupported_format",
  "animated_image",
  "source_too_large",
  "dimensions_too_large",
  "aspect_ratio_unsupported",
  "clipboard_too_large",
  "source_unavailable",
]);

function safeFailure(error: unknown): SafeTaskImageFailure {
  const candidate =
    error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : "normalization_failed";
  const code = SAFE_FAILURE_CODES.has(candidate) ? candidate : "normalization_failed";
  const explicitRetryable =
    error && typeof error === "object" && "retryable" in error && typeof error.retryable === "boolean"
      ? error.retryable
      : undefined;
  return {
    code,
    retryable: explicitRetryable ?? !NON_RETRYABLE_FAILURES.has(code),
  };
}

function createGrantRequestKey(uploadId: string) {
  return `grant_${uploadId}_${Date.now().toString(36)}`;
}

function allowlistedProviderResult(
  result: AllowlistedProviderResult & Record<string, unknown>
): AllowlistedProviderResult {
  return {
    publicId: result.publicId,
    version: result.version,
    signature: result.signature,
    resourceType: result.resourceType,
    deliveryType: result.deliveryType,
    format: result.format,
    width: result.width,
    height: result.height,
    bytes: result.bytes,
    eager: result.eager.map((variant) => ({
      transformation: variant.transformation,
      format: variant.format,
      width: variant.width,
      height: variant.height,
      bytes: variant.bytes,
    })),
  };
}

export function createTaskImageCoordinator(dependencies: TaskImageCoordinatorDependencies) {
  let draft: Draft | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const updateDetachedSafe = (job: Draft, patch: Partial<Draft>) => {
    Object.assign(job, patch);
    if (draft?.uploadId === job.uploadId) Object.assign(draft, patch);
    notify();
  };

  return {
    async select(kind: TaskImageSourceKind) {
      const uploadId = dependencies.createUploadId();
      const nextDraft: Draft = { uploadId, state: "preparing" };
      draft = nextDraft;
      notify();
      try {
        const source = await dependencies.acquireSource(kind);
        if (draft !== nextDraft) return;
        nextDraft.previewUri = source.previewUri;
        const normalized = await dependencies.normalize(source);
        if (draft !== nextDraft) return;
        await dependencies.stage({
          uploadId,
          encodingClass: normalized.encodingClass,
          width: normalized.width,
          height: normalized.height,
          bytes: normalized.bytes,
        });
        Object.assign(nextDraft, {
          state: "pending" as const,
          previewUri: normalized.previewUri,
          normalized,
          failure: undefined,
        });
        notify();
      } catch (error) {
        Object.assign(nextDraft, { state: "failed" as const, failure: safeFailure(error) });
        notify();
      }
    },

    getViewState() {
      if (!draft) return null;
      return {
        uploadId: draft.uploadId,
        state: draft.state,
        previewUri: draft.previewUri,
        failure: draft.failure,
      };
    },

    getUploadIdForSave() {
      return draft?.state === "pending" || draft?.state === "failed"
        ? draft.uploadId
        : undefined;
    },

    beginUploadAfterSave() {
      const job = draft;
      if (!job?.normalized || job.state !== "pending") return Promise.resolve();
      updateDetachedSafe(job, { state: "uploading" });
      return (async () => {
        try {
          const grant = await dependencies.issueGrant({
            uploadId: job.uploadId,
            requestKey: createGrantRequestKey(job.uploadId),
          });
          const rawResult = await dependencies.upload(job.normalized!.uri, grant);
          updateDetachedSafe(job, { state: "verifying" });
          const result = await dependencies.verify({
            uploadId: job.uploadId,
            ...allowlistedProviderResult(rawResult),
          });
          updateDetachedSafe(job, {
            state: result.state,
            failure: result.failure ? safeFailure(result.failure) : undefined,
          });
        } catch (error) {
          updateDetachedSafe(job, { state: "failed", failure: safeFailure(error) });
        }
      })();
    },

    clearAfterSaveAndStay() {
      draft = null;
      notify();
    },

    discard() {
      draft = null;
      notify();
    },

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    serialize() {
      return {
        version: 1 as const,
        draft: draft
          ? {
              uploadId: draft.uploadId,
              state: draft.state,
              failure: draft.failure,
            }
          : null,
      };
    },
  };
}

export type TaskImageCoordinator = ReturnType<typeof createTaskImageCoordinator>;
