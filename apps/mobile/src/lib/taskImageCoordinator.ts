export type TaskImageSourceKind = "photos" | "camera" | "paste";
export type TaskImageState =
  | "preparing"
  | "pending"
  | "uploading"
  | "verifying"
  | "ready"
  | "failed"
  | "unavailable";

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
  /** The server-owned provider attempt; optional keeps test adapters backward-compatible. */
  attempt?: number;
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

export type TaskImageReconciliation =
  | { status: "absent"; attempt?: number }
  | { status: "uploading" | "verifying"; attempt?: number }
  | { status: "ready" }
  | { status: "ready"; result: AllowlistedProviderResult }
  | { status: "failed"; failure: { code: string; retryable?: boolean } }
  | { status: "unknown" };

export type TaskImageManifestEntry = {
  uploadId: string;
  taskId?: string;
  taskImageId?: string;
  state: Exclude<TaskImageState, "preparing">;
  sourceKey?: string;
  encodingClass?: "jpeg" | "png";
  width?: number;
  height?: number;
  bytes?: number;
  caption?: string;
  failure?: SafeTaskImageFailure;
  attempt: number;
  retryCount: number;
  retryAt?: number;
  taskDeletionExpiresAt?: number;
  needsReconciliation: boolean;
  paused: boolean;
  recoverablyRemoved?: boolean;
};

export type TaskImageManifest = {
  version: 2;
  uploads: TaskImageManifestEntry[];
  visibleUploadIds?: string[];
};

export type TaskImageManifestStore = {
  load: (ownerScope: string) => Promise<unknown | null>;
  save: (ownerScope: string, manifest: TaskImageManifest) => Promise<void>;
};

export type TaskImageSourceStore = {
  persist: (
    uploadId: string,
    normalized: NormalizedTaskImage
  ) => Promise<{ sourceKey: string; uri: string }>;
  resolve: (sourceKey: string) => Promise<string | null>;
  remove: (sourceKey: string) => Promise<void>;
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
  upload: (
    uri: string,
    grant: TaskImageUploadGrant,
    options?: { uploadId: string; onProgress: (progress: number) => void }
  ) => Promise<AllowlistedProviderResult & Record<string, unknown>>;
  verify: (result: { uploadId: string } & AllowlistedProviderResult) => Promise<{
    state: "verifying" | "ready" | "failed";
    failure?: { code: string; retryable?: boolean };
  }>;
  reconcileAttempt?: (args: {
    uploadId: string;
    attempt: number;
    restartAttempt?: boolean;
  }) => Promise<TaskImageReconciliation>;
  reportFailure?: (args: { uploadId: string; failureCode: string }) => Promise<void>;
  abortUpload?: (args: { uploadId: string }) => Promise<void> | void;
  ownerScope?: () => string | undefined;
  manifestStore?: TaskImageManifestStore;
  sourceStore?: TaskImageSourceStore;
  now?: () => number;
};

type UploadRecord = Omit<TaskImageManifestEntry, "state"> & {
  state: TaskImageState;
  taskImageId?: string;
  recoverablyRemoved?: boolean;
  previewUri?: string;
  normalized?: NormalizedTaskImage;
  sourceUri?: string;
  progress?: number;
  acceptedForUpload: boolean;
  generation: number;
  restartAttempt?: boolean;
};

export const MAX_TASK_IMAGE_COUNT = 5 as const;
export const MAX_CONCURRENT_TASK_IMAGE_UPLOADS = 2 as const;
export const UPLOAD_RETRY_DELAYS_MS = [5_000, 30_000, 120_000] as const;
export const TASK_DELETION_RECOVERY_MS = 30 * 60 * 1000;
export const TASK_IMAGE_MANIFEST_VERSION = 2 as const;

const SAFE_FAILURE_CODES = new Set([
  "unsupported_format",
  "animated_image",
  "source_too_large",
  "dimensions_too_large",
  "aspect_ratio_unsupported",
  "clipboard_too_large",
  "clipboard_reference_only",
  "storage_unavailable",
  "memory_unavailable",
  "normalization_failed",
  "master_too_large",
  "variant_too_large",
  "source_unavailable",
  "authorization_failed",
  "provider_unavailable",
  "usage_blocked",
  "network_error",
  "upload_failed",
]);

const NON_RETRYABLE_FAILURES = new Set([
  "unsupported_format",
  "animated_image",
  "source_too_large",
  "dimensions_too_large",
  "aspect_ratio_unsupported",
  "clipboard_too_large",
  "clipboard_reference_only",
  "source_unavailable",
  "authorization_failed",
  "normalization_failed",
  "storage_unavailable",
]);

function safeFailure(error: unknown): SafeTaskImageFailure {
  const data =
    error && typeof error === "object" && "data" in error && typeof error.data === "object" && error.data !== null
      ? error.data as { code?: unknown; retryable?: unknown }
      : undefined;
  const candidate =
    data && typeof data.code === "string"
      ? data.code
      : error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : error instanceof Error && error.message === "task_image_grants_blocked"
        ? "usage_blocked"
      : "upload_failed";
  const code = SAFE_FAILURE_CODES.has(candidate) ? candidate : "normalization_failed";
  const explicitRetryable =
    data && typeof data.retryable === "boolean"
      ? data.retryable
      : error && typeof error === "object" && "retryable" in error && typeof error.retryable === "boolean"
      ? error.retryable
      : undefined;
  return {
    code,
    retryable: explicitRetryable ?? !NON_RETRYABLE_FAILURES.has(code),
  };
}

function createGrantRequestKey(uploadId: string, attempt: number) {
  return `grant_${uploadId}_attempt_${attempt}`;
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

function parseManifestEntry(value: unknown): TaskImageManifestEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<TaskImageManifestEntry>;
  if (
    typeof raw.uploadId !== "string" ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(raw.uploadId) ||
    (raw.taskImageId !== undefined &&
      (typeof raw.taskImageId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(raw.taskImageId))) ||
    !["pending", "uploading", "verifying", "ready", "failed"].includes(raw.state ?? "") ||
    !Number.isSafeInteger(raw.attempt) ||
    !Number.isSafeInteger(raw.retryCount) ||
    typeof raw.needsReconciliation !== "boolean" ||
    typeof raw.paused !== "boolean"
  ) return null;
  const failure = raw.failure && typeof raw.failure === "object"
    ? {
        code: typeof raw.failure.code === "string" && SAFE_FAILURE_CODES.has(raw.failure.code)
          ? raw.failure.code
          : "normalization_failed",
        retryable: typeof raw.failure.retryable === "boolean" ? raw.failure.retryable : false,
      }
    : undefined;
  return {
    uploadId: raw.uploadId,
    taskId: typeof raw.taskId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(raw.taskId) ? raw.taskId : undefined,
    taskImageId: typeof raw.taskImageId === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(raw.taskImageId)
      ? raw.taskImageId
      : undefined,
    state: raw.state as Exclude<TaskImageState, "preparing">,
    sourceKey: typeof raw.sourceKey === "string" && /^[A-Za-z0-9_-]{8,128}\.(?:jpg|png)$/.test(raw.sourceKey)
      ? raw.sourceKey
      : undefined,
    encodingClass: raw.encodingClass === "jpeg" || raw.encodingClass === "png" ? raw.encodingClass : undefined,
    width: Number.isSafeInteger(raw.width) ? raw.width : undefined,
    height: Number.isSafeInteger(raw.height) ? raw.height : undefined,
    bytes: Number.isSafeInteger(raw.bytes) ? raw.bytes : undefined,
    caption: typeof raw.caption === "string" && raw.caption.length <= 500 ? raw.caption : undefined,
    failure,
    attempt: raw.attempt as number,
    retryCount: raw.retryCount as number,
    retryAt: Number.isSafeInteger(raw.retryAt) ? raw.retryAt : undefined,
    taskDeletionExpiresAt: Number.isSafeInteger(raw.taskDeletionExpiresAt)
      ? raw.taskDeletionExpiresAt
      : undefined,
    needsReconciliation: raw.needsReconciliation,
    paused: raw.paused,
    recoverablyRemoved: raw.recoverablyRemoved === true,
  };
}

function redactManifest(entries: Iterable<UploadRecord>, visibleUploadIds: string[] = []): TaskImageManifest {
  const persistedEntries = [...entries].filter(
    (entry): entry is UploadRecord & { state: Exclude<TaskImageState, "preparing"> } => entry.state !== "preparing"
  );
  return {
    version: TASK_IMAGE_MANIFEST_VERSION,
    visibleUploadIds: visibleUploadIds.filter((uploadId) =>
      persistedEntries.some((entry) => entry.uploadId === uploadId && !entry.taskId)
    ),
    uploads: persistedEntries.map((entry) => ({
      uploadId: entry.uploadId,
      taskId: entry.taskId,
      taskImageId: entry.taskImageId,
      state: entry.state,
      sourceKey: entry.sourceKey,
      encodingClass: entry.encodingClass,
      width: entry.width,
      height: entry.height,
      bytes: entry.bytes,
      caption: entry.caption,
      failure: entry.failure,
      attempt: entry.attempt,
      retryCount: entry.retryCount,
      retryAt: entry.retryAt,
      taskDeletionExpiresAt: entry.taskDeletionExpiresAt,
      needsReconciliation: entry.needsReconciliation,
      paused: entry.paused,
      recoverablyRemoved: entry.recoverablyRemoved,
    })),
  };
}

export function createTaskImageCoordinator(dependencies: TaskImageCoordinatorDependencies) {
  const records = new Map<string, UploadRecord>();
  const taskUploadOrder = new Map<string, string[]>();
  let visibleUploadIds: string[] = [];
  let lastError: string | undefined;
  let foreground = true;
  let hydrated = !dependencies.manifestStore || !dependencies.ownerScope;
  let activeCount = 0;
  const running = new Set<Promise<void>>();
  const drainWaiters = new Set<() => void>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const taskDiscardTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const listeners = new Set<() => void>();
  let disposed = false;
  const notify = () => listeners.forEach((listener) => listener());
  const now = dependencies.now ?? Date.now;

  let persistChain = Promise.resolve();
  const persist = () => {
    if (disposed || !dependencies.manifestStore || !dependencies.ownerScope) return Promise.resolve();
    const ownerScope = dependencies.ownerScope();
    if (!ownerScope) return Promise.resolve();
    const snapshot = redactManifest(records.values(), visibleUploadIds);
    persistChain = persistChain
      .catch(() => undefined)
      .then(() => dependencies.manifestStore!.save(ownerScope, snapshot));
    return persistChain;
  };

  const update = (entry: UploadRecord, patch: Partial<UploadRecord>) => {
    Object.assign(entry, patch);
    void persist();
    notify();
  };

  const viewState = (entry: UploadRecord) => ({
    uploadId: entry.uploadId,
    taskImageId: entry.taskImageId,
    state: entry.state,
    previewUri: entry.previewUri,
    failure: entry.failure,
    caption: entry.caption,
    retryAt: entry.retryAt,
    progress: entry.state === "uploading" ? entry.progress : undefined,
  });

  const removeSource = async (entry: UploadRecord) => {
    if (!entry.sourceKey || !dependencies.sourceStore) return;
    try {
      await dependencies.sourceStore.remove(entry.sourceKey);
    } catch {
      // Cleanup is retried by the next lifecycle reconciliation when the source remains.
    }
  };

  const removeRecord = async (entry: UploadRecord) => {
    entry.generation += 1;
    entry.paused = true;
    const timer = timers.get(entry.uploadId);
    if (timer) clearTimeout(timer);
    timers.delete(entry.uploadId);
    records.delete(entry.uploadId);
    visibleUploadIds = visibleUploadIds.filter((uploadId) => uploadId !== entry.uploadId);
    await Promise.resolve(dependencies.abortUpload?.({ uploadId: entry.uploadId })).catch(() => undefined);
    await removeSource(entry);
  };

  const pruneCompletedRecord = (entry: UploadRecord) => {
    entry.generation += 1;
    records.delete(entry.uploadId);
    visibleUploadIds = visibleUploadIds.filter((uploadId) => uploadId !== entry.uploadId);
  };

  const discardTaskUploadsNow = async (taskId: string) => {
    const discardTimer = taskDiscardTimers.get(taskId);
    if (discardTimer) clearTimeout(discardTimer);
    taskDiscardTimers.delete(taskId);
    const taskEntries = [...records.values()].filter((entry) => entry.taskId === taskId);
    for (const entry of taskEntries) await removeRecord(entry);
    taskUploadOrder.delete(taskId);
    if (taskEntries.length) { void persist(); notify(); }
  };

  const scheduleTaskDiscard = (taskId: string, expiresAt: number) => {
    const existing = taskDiscardTimers.get(taskId);
    if (existing) clearTimeout(existing);
    taskDiscardTimers.set(
      taskId,
      setTimeout(() => {
        taskDiscardTimers.delete(taskId);
        void discardTaskUploadsNow(taskId);
      }, Math.max(0, expiresAt - now()))
    );
  };

  const discardExpiredTaskUploads = async () => {
    const expiredTaskIds = new Set(
      [...records.values()]
        .filter(
          (entry) =>
            entry.taskId &&
            entry.taskDeletionExpiresAt !== undefined &&
            entry.taskDeletionExpiresAt <= now()
        )
        .map((entry) => entry.taskId as string)
    );
    for (const taskId of expiredTaskIds) await discardTaskUploadsNow(taskId);
  };

  const failEntry = async (entry: UploadRecord, error: unknown) => {
    const failure = safeFailure(error);
    const retryCount = failure.retryable ? entry.retryCount + 1 : entry.retryCount;
    const retryAt = failure.retryable && retryCount <= UPLOAD_RETRY_DELAYS_MS.length
      ? now() + UPLOAD_RETRY_DELAYS_MS[retryCount - 1]
      : undefined;
    update(entry, {
      state: "failed",
      failure,
      retryCount,
      retryAt,
      needsReconciliation: entry.attempt > 0,
    });
    if (!failure.retryable) {
      await Promise.resolve(dependencies.reportFailure?.({ uploadId: entry.uploadId, failureCode: failure.code })).catch(() => undefined);
      await removeSource(entry);
    }
    if (retryAt) {
      scheduleRetry(entry, retryAt);
    }
  };

  const verifyReconciledResult = async (entry: UploadRecord, result: AllowlistedProviderResult) => {
    update(entry, { state: "verifying", retryAt: undefined });
    const verified = await dependencies.verify({ uploadId: entry.uploadId, ...result });
    update(entry, {
      state: verified.state,
      failure: verified.failure ? safeFailure(verified.failure) : undefined,
      needsReconciliation: false,
      retryAt: undefined,
    });
    if (verified.state === "ready") {
      await removeSource(entry);
      if (entry.taskId || !visibleUploadIds.includes(entry.uploadId)) {
        pruneCompletedRecord(entry);
        void persist();
        notify();
      }
    }
  };

  const reconcileBeforeAttempt = async (entry: UploadRecord, restartAttempt: boolean) => {
    if (!entry.needsReconciliation) return true;
    if (!dependencies.reconcileAttempt) return true;
    let result: TaskImageReconciliation;
    try {
      result = await dependencies.reconcileAttempt({
        uploadId: entry.uploadId,
        attempt: entry.attempt,
        ...(restartAttempt ? { restartAttempt: true } : {}),
      });
    } catch {
      return false;
    }
    if (result.status === "absent") {
      update(entry, { attempt: result.attempt ?? entry.attempt, needsReconciliation: false });
      return true;
    }
    if (result.status === "ready") {
      if (!("result" in result)) {
        update(entry, { state: "ready", needsReconciliation: false, retryAt: undefined });
        await removeSource(entry);
        return false;
      }
      try {
        await verifyReconciledResult(entry, result.result);
      } catch (error) {
        await failEntry(entry, error);
      }
      return false;
    }
    if (result.status === "failed") {
      update(entry, { needsReconciliation: false, failure: safeFailure(result.failure) });
      return true;
    }
    if (result.status === "uploading" || result.status === "verifying") {
      update(entry, { state: "verifying", retryAt: undefined });
    }
    return false;
  };

  const runEntry = async (entry: UploadRecord) => {
    const generation = entry.generation;
    const restartAttempt = entry.restartAttempt === true;
    entry.restartAttempt = undefined;
    activeCount += 1;
    update(entry, { state: "uploading", failure: undefined, progress: undefined });
    try {
      if (entry.needsReconciliation && !(await reconcileBeforeAttempt(entry, restartAttempt))) {
        if (entry.state === "uploading") {
          await failEntry(entry, { code: "provider_unavailable", retryable: true });
        }
        return;
      }
      const sourceUri = entry.sourceUri ?? (
        entry.sourceKey && dependencies.sourceStore
          ? await dependencies.sourceStore.resolve(entry.sourceKey)
          : undefined
      );
      if (!sourceUri) throw Object.assign(new Error("source_unavailable"), { code: "source_unavailable" });
      const nextAttempt = entry.attempt + 1;
      const grant = await dependencies.issueGrant({
        uploadId: entry.uploadId,
        requestKey: createGrantRequestKey(entry.uploadId, nextAttempt),
      });
      if (entry.generation !== generation || entry.paused) return;
      entry.attempt = grant.attempt ?? nextAttempt;
      update(entry, { attempt: entry.attempt, needsReconciliation: false });
      const rawResult = await dependencies.upload(sourceUri, grant, {
        uploadId: entry.uploadId,
        onProgress: (progress) => {
          if (entry.generation === generation && !entry.paused) {
            update(entry, { progress: Math.max(0, Math.min(1, progress)) });
          }
        },
      });
      if (entry.generation !== generation || entry.paused) return;
      await verifyReconciledResult(entry, allowlistedProviderResult(rawResult));
    } catch (error) {
      if (entry.generation !== generation || entry.paused) return;
      await failEntry(entry, error);
    } finally {
      activeCount -= 1;
      void persist();
      notify();
      for (const resolve of [...drainWaiters]) {
        if (activeCount === 0 && ![...records.values()].some((candidate) => candidate.acceptedForUpload && candidate.state === "pending")) {
          drainWaiters.delete(resolve);
          resolve();
        }
      }
    }
  };

  const resolveDrained = () => {
    if (activeCount !== 0 || [...records.values()].some((entry) => entry.acceptedForUpload && entry.state === "pending")) return;
    for (const resolve of [...drainWaiters]) {
      drainWaiters.delete(resolve);
      resolve();
    }
  };

  const waitForDrain = () => new Promise<void>((resolve) => {
    drainWaiters.add(resolve);
    resolveDrained();
  });

  const scheduleRetry = (entry: UploadRecord, retryAt: number) => {
    const existing = timers.get(entry.uploadId);
    if (existing) clearTimeout(existing);
    timers.set(
      entry.uploadId,
      setTimeout(() => {
        timers.delete(entry.uploadId);
        if (entry.state === "failed" && entry.retryAt === retryAt) {
          update(entry, { state: "pending", retryAt: undefined, acceptedForUpload: true });
          void pump();
        }
      }, Math.max(0, retryAt - now()))
    );
  };

  const pump = async () => {
    if (!foreground) return;
    while (foreground && activeCount < MAX_CONCURRENT_TASK_IMAGE_UPLOADS) {
      const next = [...records.values()].find(
        (entry) => entry.acceptedForUpload && !entry.paused && entry.state === "pending"
      );
      if (!next) return;
      const worker = runEntry(next);
      running.add(worker);
      void worker.finally(() => {
        running.delete(worker);
        void pump();
        resolveDrained();
      });
      if (activeCount >= MAX_CONCURRENT_TASK_IMAGE_UPLOADS) return;
    }
  };

  const ensureHydrated = async () => {
    if (hydrated) return;
    hydrated = true;
    const ownerScope = dependencies.ownerScope?.();
    if (!ownerScope || !dependencies.manifestStore) return;
    let raw: unknown;
    try {
      raw = await dependencies.manifestStore.load(ownerScope);
    } catch {
      return;
    }
    const manifestVisibleUploadIds =
      raw && typeof raw === "object" && Array.isArray((raw as { visibleUploadIds?: unknown }).visibleUploadIds)
        ? (raw as { visibleUploadIds: unknown[] }).visibleUploadIds.filter(
            (uploadId): uploadId is string => typeof uploadId === "string"
          )
        : [];
    const uploads =
      raw && typeof raw === "object" && "version" in raw && (raw as { version?: unknown }).version === 2 &&
      Array.isArray((raw as { uploads?: unknown }).uploads)
        ? (raw as unknown as { uploads: unknown[] }).uploads.flatMap((entry) => {
            const parsed = parseManifestEntry(entry);
            return parsed ? [parsed] : [];
          })
        : [];
    for (const entry of uploads) {
      const restored: UploadRecord = {
        ...entry,
        state: entry.state === "uploading" || entry.state === "verifying" ? "pending" : entry.state,
        needsReconciliation: entry.needsReconciliation || entry.state === "uploading" || entry.state === "verifying",
        acceptedForUpload: entry.state !== "ready" && !entry.paused,
        generation: 0,
      };
      records.set(entry.uploadId, restored);
      if (restored.taskId) {
        const ordered = taskUploadOrder.get(restored.taskId) ?? [];
        if (!ordered.includes(restored.uploadId)) taskUploadOrder.set(restored.taskId, [...ordered, restored.uploadId]);
        if (restored.state === "ready" &&
          (restored.taskId || !manifestVisibleUploadIds.includes(restored.uploadId))) {
          await removeSource(restored);
          pruneCompletedRecord(restored);
          continue;
        }
        if (
          restored.paused &&
          !restored.recoverablyRemoved &&
          restored.taskDeletionExpiresAt === undefined
        ) {
          restored.taskDeletionExpiresAt = now() + TASK_DELETION_RECOVERY_MS;
        }
        if (restored.taskDeletionExpiresAt !== undefined && restored.taskDeletionExpiresAt > now()) {
          scheduleTaskDiscard(restored.taskId, restored.taskDeletionExpiresAt);
        }
      }
      if (restored.state === "failed" && restored.retryAt) {
        if (restored.retryAt <= now()) {
          restored.state = "pending";
          restored.retryAt = undefined;
        } else {
          scheduleRetry(restored, restored.retryAt);
        }
      }
    }
    await discardExpiredTaskUploads();
    visibleUploadIds = manifestVisibleUploadIds.filter(
      (uploadId) => records.get(uploadId)?.taskId === undefined
    );
    for (const restored of records.values()) {
      if (!restored.taskId && !visibleUploadIds.includes(restored.uploadId)) {
        visibleUploadIds.push(restored.uploadId);
      }
    }
    void persist();
    notify();
  };

  return {
    async hydrate() {
      await ensureHydrated();
    },

    async select(kind: TaskImageSourceKind) {
      await ensureHydrated();
      if (visibleUploadIds.length >= MAX_TASK_IMAGE_COUNT) {
        lastError = "Task image limit reached";
        notify();
        return;
      }
      const uploadId = dependencies.createUploadId();
      const nextRecord: UploadRecord = {
        uploadId,
        state: "preparing",
        attempt: 0,
        retryCount: 0,
        needsReconciliation: false,
        paused: false,
        acceptedForUpload: false,
        generation: 0,
      };
      records.set(uploadId, nextRecord);
      visibleUploadIds = [...visibleUploadIds, uploadId];
      lastError = undefined;
      notify();
      try {
        const source = await dependencies.acquireSource(kind);
        if (!records.has(uploadId)) return;
        nextRecord.previewUri = source.previewUri;
        const normalized = await dependencies.normalize(source);
        if (!records.has(uploadId)) return;
        const durable = dependencies.sourceStore
          ? await dependencies.sourceStore.persist(uploadId, normalized)
          : { sourceKey: undefined, uri: normalized.uri };
        await dependencies.stage({
          uploadId,
          encodingClass: normalized.encodingClass,
          width: normalized.width,
          height: normalized.height,
          bytes: normalized.bytes,
        });
        Object.assign(nextRecord, {
          state: "pending" as const,
          previewUri: normalized.previewUri,
          normalized,
          sourceKey: durable.sourceKey,
          sourceUri: durable.uri,
          encodingClass: normalized.encodingClass,
          width: normalized.width,
          height: normalized.height,
          bytes: normalized.bytes,
          failure: undefined,
        });
        await persist();
        notify();
      } catch (error) {
        if (!nextRecord.previewUri && !nextRecord.normalized) {
          const failure = safeFailure(error);
          await removeRecord(nextRecord);
          lastError = failure.code === "clipboard_reference_only"
            ? "Clipboard contains a file reference, not image data. Copy the image itself and paste again."
            : failure.code === "source_unavailable"
              ? "No image was selected."
              : "The image could not be selected.";
          await persist();
          notify();
          return;
        }
        await failEntry(nextRecord, error);
        notify();
      }
    },

    getViewState() {
      const first = visibleUploadIds[0] ? records.get(visibleUploadIds[0]) : undefined;
      return first ? viewState(first) : null;
    },

    getViewStates() {
      return visibleUploadIds.flatMap((uploadId) => {
        const entry = records.get(uploadId);
        return entry ? [viewState(entry)] : [];
      });
    },

    getLastError() {
      return lastError;
    },

    updateCaption(uploadId: string, rawCaption: string) {
      const record = records.get(uploadId);
      if (!record) return;
      const caption = rawCaption.trim();
      if (caption.length > 500) {
        lastError = "Caption must be 500 characters or fewer";
        notify();
        return;
      }
      lastError = undefined;
      update(record, { caption: caption || undefined });
    },

    reorder(uploadIds: string[]) {
      if (uploadIds.length !== visibleUploadIds.length) return;
      if (new Set(uploadIds).size !== uploadIds.length || uploadIds.some((id) => !records.has(id))) return;
      visibleUploadIds = [...uploadIds];
      void persist();
      notify();
    },

    remove(uploadId: string) {
      const record = records.get(uploadId);
      if (!record) return;
      void removeRecord(record).then(() => void persist());
      lastError = undefined;
      notify();
    },

    getUploadIdForSave() {
      return this.getUploadIdsForSave()[0];
    },

    getUploadIdsForSave() {
      return this.getImageInputsForSave().map((image) => image.uploadId);
    },

    getImageInputsForSave() {
      return visibleUploadIds.flatMap((uploadId) => {
        const record = records.get(uploadId);
        return record && (record.state === "pending" || record.state === "failed")
          ? [{ uploadId: record.uploadId, caption: record.caption }]
          : [];
      });
    },

    associateUploadsWithTask(taskId: string, uploadIds: string[]) {
      const existing = taskUploadOrder.get(taskId) ?? [];
      const ordered = [...existing, ...uploadIds.filter((uploadId) => !existing.includes(uploadId))];
      taskUploadOrder.set(taskId, ordered);
      for (const uploadId of uploadIds) {
        const entry = records.get(uploadId);
        if (entry) update(entry, { taskId });
      }
    },

    associateTaskImageOrder(taskId: string, taskImageIds: string[]) {
      const uploadIds = taskUploadOrder.get(taskId) ?? [];
      let changed = false;
      const entriesByTaskImageId = new Map(
        [...records.values()]
          .filter((entry) => entry.taskId === taskId && entry.taskImageId)
          .map((entry) => [entry.taskImageId as string, entry])
      );
      const unassignedEntries = [...records.values()]
        .filter((entry) => entry.taskId === taskId && !entry.taskImageId)
        .sort((left, right) => uploadIds.indexOf(left.uploadId) - uploadIds.indexOf(right.uploadId));
      const missingTaskImageIds = taskImageIds.filter((taskImageId) => !entriesByTaskImageId.has(taskImageId));
      const alignmentOffset = Math.max(0, missingTaskImageIds.length - unassignedEntries.length);
      for (const [index, entry] of unassignedEntries.entries()) {
        const taskImageId = missingTaskImageIds[alignmentOffset + index];
        if (taskImageId) {
          if (entry.taskImageId !== taskImageId) {
            entry.taskImageId = taskImageId;
            changed = true;
          }
          entriesByTaskImageId.set(taskImageId, entry);
        }
      }
      const associatedUploadIds = taskImageIds.flatMap((taskImageId) => {
        const entry = entriesByTaskImageId.get(taskImageId);
        return entry ? [entry.uploadId] : [];
      });
      const associatedSet = new Set(associatedUploadIds);
      const unmappedUploadIds = uploadIds.filter((uploadId) => !associatedSet.has(uploadId));
      const nextTaskUploadOrder = [...associatedUploadIds, ...unmappedUploadIds];
      if (nextTaskUploadOrder.length > 0) {
        const previousOrder = taskUploadOrder.get(taskId) ?? [];
        if (
          previousOrder.length !== nextTaskUploadOrder.length ||
          previousOrder.some((uploadId, index) => uploadId !== nextTaskUploadOrder[index])
        ) {
          taskUploadOrder.set(taskId, nextTaskUploadOrder);
          changed = true;
        }
        if (changed) void persist();
        return true;
      }
      if (uploadIds.length !== taskImageIds.length) return false;
      for (const [index, uploadId] of uploadIds.entries()) {
        const entry = records.get(uploadId);
        if (entry && entry.taskImageId !== taskImageIds[index]) {
          entry.taskImageId = taskImageIds[index];
          changed = true;
        }
      }
      if (changed) void persist();
      return true;
    },

    beginUploadAfterSave() {
      for (const entry of records.values()) {
        if (entry.state === "pending" && !entry.paused) entry.acceptedForUpload = true;
      }
      void persist();
      void pump();
      return waitForDrain();
    },

    async retry(uploadId: string) {
      const entry = records.get(uploadId);
      if (!entry || entry.state !== "failed" || !entry.failure?.retryable) return;
      const timer = timers.get(uploadId);
      if (timer) clearTimeout(timer);
      timers.delete(uploadId);
      update(entry, {
        state: "pending",
        retryAt: undefined,
        retryCount: 0,
        acceptedForUpload: true,
        restartAttempt: true,
      });
      await pump();
      await waitForDrain();
    },

    async retryTaskImageUpload(
      taskId: string,
      taskImageId: string,
      onState?: (state: ReturnType<typeof viewState>) => void,
    ) {
      const entry = [...records.values()].find(
        (candidate) => candidate.taskId === taskId && candidate.taskImageId === taskImageId
      );
      if (!entry) return undefined;

      let latest = viewState(entry);
      const emit = () => {
        latest = viewState(entry);
        onState?.(latest);
      };
      const listener = () => emit();
      if (onState) listeners.add(listener);
      try {
        emit();
        await this.retry(entry.uploadId);
        emit();
        return latest;
      } finally {
        if (onState) listeners.delete(listener);
      }
    },

    async reconcileOnForeground() {
      if (disposed) return;
      await ensureHydrated();
      await discardExpiredTaskUploads();
      foreground = true;
      for (const entry of records.values()) {
        if (entry.state === "ready") {
          if (entry.taskId) await removeRecord(entry);
          continue;
        }
        if (!dependencies.reconcileAttempt || entry.attempt === 0) continue;
        const reconciliation = await dependencies.reconcileAttempt({ uploadId: entry.uploadId, attempt: entry.attempt }).catch(() => ({ status: "unknown" as const }));
        if (reconciliation.status === "ready") {
          try {
            if ("result" in reconciliation) await verifyReconciledResult(entry, reconciliation.result);
            else {
              update(entry, { state: "ready", needsReconciliation: false, retryAt: undefined });
              await removeSource(entry);
            }
          } catch (error) { await failEntry(entry, error); }
        } else if (reconciliation.status === "absent") {
          const retryDue = entry.retryAt === undefined || entry.retryAt <= now();
          const canAutoRetry = entry.retryCount < UPLOAD_RETRY_DELAYS_MS.length;
          if (retryDue && canAutoRetry) {
            update(entry, {
              attempt: reconciliation.attempt ?? entry.attempt,
              state: "pending",
              needsReconciliation: false,
              acceptedForUpload: !entry.paused,
            });
          } else {
            update(entry, { state: "failed", needsReconciliation: false, acceptedForUpload: false });
            if (entry.retryAt && entry.retryAt > now()) scheduleRetry(entry, entry.retryAt);
          }
        } else if (reconciliation.status === "uploading" || reconciliation.status === "verifying") {
          update(entry, {
            attempt: reconciliation.attempt ?? entry.attempt,
            state: "verifying",
            needsReconciliation: true,
            acceptedForUpload: false,
          });
        } else if (reconciliation.status === "failed") {
          update(entry, { state: "failed", failure: safeFailure(reconciliation.failure), needsReconciliation: false });
        }
      }
      void pump();
    },

    setForeground(isForeground: boolean) {
      if (disposed) return;
      foreground = isForeground;
      if (foreground) void pump();
    },

    pauseTaskUploads(taskId: string) {
      let paused = 0;
      const taskDeletionExpiresAt = now() + TASK_DELETION_RECOVERY_MS;
      scheduleTaskDiscard(taskId, taskDeletionExpiresAt);
      for (const entry of records.values()) {
        if (entry.taskId !== taskId || entry.state === "ready") continue;
        entry.generation += 1;
        update(entry, {
          paused: true,
          acceptedForUpload: false,
          state: entry.state === "uploading" || entry.state === "verifying" ? "pending" : entry.state,
          taskDeletionExpiresAt,
        });
        void dependencies.abortUpload?.({ uploadId: entry.uploadId });
        paused += 1;
      }
      if (paused) notify();
      return paused;
    },

    pauseTaskImageUpload(taskId: string, taskImageId: string) {
      const entry = [...records.values()].find(
        (candidate) => candidate.taskId === taskId && candidate.taskImageId === taskImageId
      );
      if (!entry) return false;
      entry.generation += 1;
      entry.paused = true;
      entry.recoverablyRemoved = true;
      entry.acceptedForUpload = false;
      if (entry.state === "uploading" || entry.state === "verifying") entry.state = "pending";
      void dependencies.abortUpload?.({ uploadId: entry.uploadId });
      const ordered = taskUploadOrder.get(taskId);
      if (ordered) taskUploadOrder.set(taskId, ordered.filter((uploadId) => uploadId !== entry.uploadId));
      void persist();
      notify();
      return true;
    },

    suspendAllUploads() {
      let suspended = 0;
      for (const entry of records.values()) {
        if (entry.state === "ready" || entry.paused) continue;
        entry.generation += 1;
        if (entry.state === "uploading" || entry.state === "verifying") entry.state = "pending";
        entry.needsReconciliation = entry.attempt > 0;
        void dependencies.abortUpload?.({ uploadId: entry.uploadId });
        suspended += 1;
      }
      if (suspended) { void persist(); notify(); }
      return suspended;
    },

    async resumeTaskUploads(taskId: string) {
      const discardTimer = taskDiscardTimers.get(taskId);
      if (discardTimer) clearTimeout(discardTimer);
      taskDiscardTimers.delete(taskId);
      for (const entry of records.values()) {
        if (entry.taskId !== taskId) continue;
        if (entry.taskDeletionExpiresAt !== undefined) {
          update(entry, {
            taskDeletionExpiresAt: undefined,
            ...(entry.paused && !entry.recoverablyRemoved
              ? { paused: false, acceptedForUpload: entry.state === "pending" }
              : {}),
          });
        }
      }
      await pump();
    },

    async resumeTaskImageUpload(taskId: string, taskImageId: string) {
      const entry = [...records.values()].find(
        (candidate) => candidate.taskId === taskId && candidate.taskImageId === taskImageId
      );
      if (!entry || !entry.recoverablyRemoved) return false;
      update(entry, {
        paused: false,
        recoverablyRemoved: false,
        acceptedForUpload: entry.state === "pending",
      });
      const ordered = taskUploadOrder.get(taskId) ?? [];
      if (!ordered.includes(entry.uploadId)) {
        taskUploadOrder.set(taskId, [...ordered, entry.uploadId]);
      }
      await pump();
      return true;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      foreground = false;
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const entry of records.values()) {
        entry.generation += 1;
        entry.paused = true;
        void dependencies.abortUpload?.({ uploadId: entry.uploadId });
      }
      for (const timer of taskDiscardTimers.values()) clearTimeout(timer);
      taskDiscardTimers.clear();
      for (const resolve of drainWaiters) resolve();
      drainWaiters.clear();
      listeners.clear();
    },

    async discardTaskUploads(taskId: string) {
      const discardTimer = taskDiscardTimers.get(taskId);
      if (discardTimer) clearTimeout(discardTimer);
      taskDiscardTimers.delete(taskId);
      await discardTaskUploadsNow(taskId);
    },

    clearAfterSaveAndStay() {
      visibleUploadIds = [];
      lastError = undefined;
      void persist();
      notify();
    },

    discard() {
      const pending = [...records.values()].filter((entry) => !entry.taskId && !entry.acceptedForUpload);
      visibleUploadIds = [];
      lastError = undefined;
      void Promise.all(pending.map((entry) => removeRecord(entry))).then(() => void persist());
      notify();
    },

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    serialize() {
      return redactManifest(records.values());
    },
  };
}

export type TaskImageCoordinator = ReturnType<typeof createTaskImageCoordinator>;
