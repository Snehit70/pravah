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
  caption?: string;
};

export const MAX_TASK_IMAGE_COUNT = 5 as const;

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
  let drafts: Draft[] = [];
  let lastError: string | undefined;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const updateDetachedSafe = (job: Draft, patch: Partial<Draft>) => {
    Object.assign(job, patch);
    notify();
  };

  const viewState = (draft: Draft) => ({
    uploadId: draft.uploadId,
    state: draft.state,
    previewUri: draft.previewUri,
    failure: draft.failure,
    caption: draft.caption,
  });

  return {
    async select(kind: TaskImageSourceKind) {
      if (drafts.length >= MAX_TASK_IMAGE_COUNT) {
        lastError = "Task image limit reached";
        notify();
        return;
      }
      const uploadId = dependencies.createUploadId();
      const nextDraft: Draft = { uploadId, state: "preparing" };
      drafts = [...drafts, nextDraft];
      lastError = undefined;
      notify();
      try {
        const source = await dependencies.acquireSource(kind);
        if (!drafts.includes(nextDraft)) return;
        nextDraft.previewUri = source.previewUri;
        const normalized = await dependencies.normalize(source);
        if (!drafts.includes(nextDraft)) return;
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
      return drafts[0] ? viewState(drafts[0]) : null;
    },

    getViewStates() {
      return drafts.map(viewState);
    },

    getLastError() {
      return lastError;
    },

    updateCaption(uploadId: string, rawCaption: string) {
      const draft = drafts.find((candidate) => candidate.uploadId === uploadId);
      if (!draft) return;
      const caption = rawCaption.trim();
      if (caption.length > 500) {
        lastError = "Caption must be 500 characters or fewer";
        notify();
        return;
      }
      lastError = undefined;
      draft.caption = caption || undefined;
      notify();
    },

    reorder(uploadIds: string[]) {
      if (uploadIds.length !== drafts.length) return;
      const byId = new Map(drafts.map((draft) => [draft.uploadId, draft]));
      if (new Set(uploadIds).size !== uploadIds.length || uploadIds.some((id) => !byId.has(id))) return;
      drafts = uploadIds.map((id) => byId.get(id)!);
      notify();
    },

    remove(uploadId: string) {
      const next = drafts.filter((draft) => draft.uploadId !== uploadId);
      if (next.length === drafts.length) return;
      drafts = next;
      lastError = undefined;
      notify();
    },

    getUploadIdForSave() {
      return this.getUploadIdsForSave()[0];
    },

    getUploadIdsForSave() {
      return drafts
        .filter((draft) => draft.state === "pending" || draft.state === "failed")
        .map((draft) => draft.uploadId);
    },

    beginUploadAfterSave() {
      const jobs = drafts.filter((draft) => draft.normalized && draft.state === "pending");
      return Promise.all(jobs.map(async (job) => {
        updateDetachedSafe(job, { state: "uploading" });
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
      }));
    },

    clearAfterSaveAndStay() {
      drafts = [];
      lastError = undefined;
      notify();
    },

    discard() {
      drafts = [];
      lastError = undefined;
      notify();
    },

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    serialize() {
      const draft = drafts[0];
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
