import { describe, expect, it, vi } from "vitest";
import {
  createTaskImageCoordinator,
  UPLOAD_RETRY_DELAYS_MS,
  type TaskImageCoordinatorDependencies,
  type TaskImageSourceKind,
} from "../lib/taskImageCoordinator";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function createDependencies(): TaskImageCoordinatorDependencies {
  return {
    createUploadId: vi.fn(() => "upl_mobile_1"),
    acquireSource: vi.fn(async (kind: TaskImageSourceKind) => ({
      kind,
      uri: `content://private/${kind}`,
      previewUri: `file:///private/preview-${kind}.jpg`,
    })),
    normalize: vi.fn(async (source) => ({
      uri: "file:///private/normalized.jpg",
      previewUri: source.previewUri,
      encodingClass: "jpeg" as const,
      width: 1600,
      height: 1200,
      bytes: 2_000_000,
    })),
    stage: vi.fn(async () => undefined),
    issueGrant: vi.fn(async () => ({
      uploadUrl: "https://api.cloudinary.example/private",
      signature: "signed-secret-capability",
      apiKey: "public-key",
      signedParameters: { timestamp: "1" },
    })),
    upload: vi.fn(async () => ({
      publicId: "provider-private-id",
      version: 1,
      signature: "provider-response-signature",
      resourceType: "image",
      deliveryType: "authenticated",
      format: "jpg",
      width: 1600,
      height: 1200,
      bytes: 2_000_000,
      eager: [],
      secureUrl: "https://secret.example/master",
    })),
    verify: vi.fn(async () => ({ state: "verifying" as const })),
  };
}

describe("Task-image mobile coordinator", () => {
  it.each(["photos", "camera", "paste"] as const)(
    "routes %s through the same normalization and owner staging contract",
    async (kind) => {
      const dependencies = createDependencies();
      const coordinator = createTaskImageCoordinator(dependencies);

      await coordinator.select(kind);

      expect(dependencies.acquireSource).toHaveBeenCalledWith(kind);
      expect(dependencies.normalize).toHaveBeenCalledWith(
        expect.objectContaining({ kind, uri: `content://private/${kind}` })
      );
      expect(dependencies.stage).toHaveBeenCalledWith({
        uploadId: "upl_mobile_1",
        encodingClass: "jpeg",
        width: 1600,
        height: 1200,
        bytes: 2_000_000,
      });
      expect(coordinator.getViewState()).toMatchObject({
        uploadId: "upl_mobile_1",
        state: "pending",
        previewUri: `file:///private/preview-${kind}.jpg`,
      });
    }
  );

  it("keeps Task save independent, clears the next Capture preview, and finishes detached upload work", async () => {
    const dependencies = createDependencies();
    const grant = deferred<Awaited<ReturnType<TaskImageCoordinatorDependencies["issueGrant"]>>>();
    dependencies.issueGrant = vi.fn(() => grant.promise);
    const coordinator = createTaskImageCoordinator(dependencies);
    await coordinator.select("photos");

    expect(coordinator.getUploadIdForSave()).toBe("upl_mobile_1");
    const completion = coordinator.beginUploadAfterSave();
    coordinator.clearAfterSaveAndStay();

    expect(coordinator.getViewState()).toBeNull();
    expect(dependencies.issueGrant).toHaveBeenCalledWith({
      uploadId: "upl_mobile_1",
      requestKey: expect.stringMatching(/^grant_/),
    });
    expect(dependencies.upload).not.toHaveBeenCalled();

    grant.resolve({
      uploadUrl: "https://api.cloudinary.example/private",
      signature: "signed-secret-capability",
      apiKey: "public-key",
      signedParameters: { timestamp: "1" },
    });
    await completion;
    expect(dependencies.upload).toHaveBeenCalledWith(
      "file:///private/normalized.jpg",
      expect.objectContaining({ signature: "signed-secret-capability" }),
      expect.objectContaining({ uploadId: "upl_mobile_1", onProgress: expect.any(Function) })
    );
    expect(dependencies.verify).toHaveBeenCalledWith(
      expect.not.objectContaining({ secureUrl: expect.anything() })
    );
  });

  it("reports detached upload failures after the Task has been saved", async () => {
    const dependencies = createDependencies();
    dependencies.issueGrant = vi.fn(async () => {
      throw Object.assign(new Error("provider unavailable"), {
        code: "storage_unavailable",
      });
    });
    dependencies.reportFailure = vi.fn(async () => undefined);
    const coordinator = createTaskImageCoordinator(dependencies);
    await coordinator.select("photos");

    const completion = coordinator.beginUploadAfterSave();
    coordinator.clearAfterSaveAndStay();
    await completion;

    expect(dependencies.reportFailure).toHaveBeenCalledWith({
      uploadId: "upl_mobile_1",
      failureCode: "storage_unavailable",
    });
  });

  it("surfaces stable safe failures and serializes no private capabilities or paths", async () => {
    const dependencies = createDependencies();
    dependencies.normalize = vi.fn(async () => {
      throw Object.assign(new Error("decoder details must stay private"), {
        code: "animated_image",
        retryable: false,
      });
    });
    const coordinator = createTaskImageCoordinator(dependencies);

    await coordinator.select("paste");

    expect(coordinator.getViewState()).toMatchObject({
      state: "failed",
      failure: { code: "animated_image", retryable: false },
    });
    expect(coordinator.serialize()).toMatchObject({
      version: 2,
      uploads: [{
        uploadId: "upl_mobile_1",
        state: "failed",
        failure: { code: "animated_image", retryable: false },
      }],
    });
    expect(JSON.stringify(coordinator.serialize())).not.toMatch(
      /content:\/\/|file:\/\/|cloudinary|signed-secret|provider-private|decoder details/
    );
  });

  it("keeps five ordered Capture images with captions and replaces a removed slot", async () => {
    const dependencies = createDependencies();
    let nextId = 1;
    dependencies.createUploadId = vi.fn(() => `upl_mobile_${nextId++}`);
    const coordinator = createTaskImageCoordinator(dependencies);

    await coordinator.select("photos");
    await coordinator.select("camera");
    await coordinator.select("paste");
    await coordinator.select("photos");
    await coordinator.select("camera");

    expect(coordinator.getViewStates()).toHaveLength(5);
    await coordinator.select("paste");
    expect(coordinator.getViewStates()).toHaveLength(5);
    expect(coordinator.getLastError()).toBe("Task image limit reached");

    const ids = coordinator.getViewStates().map((image) => image.uploadId);
    coordinator.updateCaption(ids[0], "  First reference  ");
    coordinator.reorder([ids[1], ids[0], ...ids.slice(2)]);
    expect(coordinator.getViewStates().map((image) => image.uploadId)).toEqual([
      ids[1],
      ids[0],
      ...ids.slice(2),
    ]);
    expect(coordinator.getViewStates()[1].caption).toBe("First reference");
    expect(coordinator.getImageInputsForSave()).toContainEqual({
      uploadId: ids[0],
      caption: "First reference",
    });

    coordinator.remove(ids[0]);
    expect(coordinator.getViewStates()).toHaveLength(4);
    await coordinator.select("paste");
    expect(coordinator.getViewStates()).toHaveLength(5);
    expect(coordinator.getUploadIdsForSave()).toHaveLength(5);
  });

  it("clears the visible draft without discarding task-owned recovery records", async () => {
    const coordinator = createTaskImageCoordinator(createDependencies());
    await coordinator.select("photos");
    coordinator.associateUploadsWithTask("task_1", ["upl_mobile_1"]);

    coordinator.discard();

    expect(coordinator.getViewStates()).toEqual([]);
    expect(coordinator.serialize().uploads).toHaveLength(1);
  });

  it("persists a redacted owner-scoped manifest without private source or provider data", async () => {
    const dependencies = createDependencies();
    const saved: Array<[string, unknown]> = [];
    const store = {
      load: vi.fn(async () => null),
      save: vi.fn(async (scope: string, manifest: unknown) => {
        saved.push([scope, manifest]);
      }),
    };
    const sourceStore = {
      persist: vi.fn(async () => ({ sourceKey: "upl_mobile_1.jpg", uri: "file:///private/durable.jpg" })),
      resolve: vi.fn(async () => "file:///private/durable.jpg"),
      remove: vi.fn(async () => undefined),
    };
    const coordinator = createTaskImageCoordinator({
      ...dependencies,
      ownerScope: () => "owner-a",
      manifestStore: store,
      sourceStore,
    });

    await coordinator.select("photos");

    expect(saved.at(-1)?.[0]).toBe("owner-a");
    expect(saved.at(-1)?.[1]).toEqual(expect.objectContaining({ version: 2 }));
    const serialized = JSON.stringify(saved.at(-1)?.[1]);
    expect(serialized).toContain("upl_mobile_1.jpg");
    expect(serialized).not.toMatch(/content:\/\/|file:\/\/|https:\/\/|signature|grant|secret|publicId|secureUrl/);
  });

  it("restores the user-selected visible image order from the manifest", async () => {
    const first = createDependencies();
    let nextId = 1;
    first.createUploadId = vi.fn(() => `upl_mobile_${nextId++}`);
    let persisted: unknown = null;
    const store = {
      load: vi.fn(async () => persisted),
      save: vi.fn(async (_scope: string, manifest: unknown) => { persisted = manifest; }),
    };
    const coordinator = createTaskImageCoordinator({
      ...first,
      ownerScope: () => "owner-a",
      manifestStore: store,
    });
    await coordinator.select("photos");
    await coordinator.select("camera");
    const ids = coordinator.getViewStates().map((image) => image.uploadId);
    coordinator.reorder([ids[1], ids[0]]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(persisted).toMatchObject({ visibleUploadIds: [ids[1], ids[0]] });

    const restored = createTaskImageCoordinator({
      ...createDependencies(),
      ownerScope: () => "owner-a",
      manifestStore: store,
    });
    await restored.hydrate();

    expect(restored.getViewStates().map((image) => image.uploadId)).toEqual([ids[1], ids[0]]);
  });

  it("skips ready records during foreground reconciliation and prunes sealed records", async () => {
    const dependencies = createDependencies();
    dependencies.reconcileAttempt = vi.fn(async () => ({ status: "unknown" as const }));
    const coordinator = createTaskImageCoordinator({
      ...dependencies,
      ownerScope: () => "owner-a",
      manifestStore: {
        load: vi.fn(async () => ({
          version: 2,
          uploads: [{
            uploadId: "upl_mobile_1",
            taskId: "task_1",
            state: "ready",
            attempt: 1,
            retryCount: 0,
            needsReconciliation: false,
            paused: false,
          }],
        })),
        save: vi.fn(async () => undefined),
      },
    });

    await coordinator.reconcileOnForeground();

    expect(dependencies.reconcileAttempt).not.toHaveBeenCalled();
    expect(coordinator.serialize().uploads).toHaveLength(0);
  });

  it("does not discard task-owned or already accepted records", async () => {
    const dependencies = createDependencies();
    let nextId = 1;
    dependencies.createUploadId = vi.fn(() => `upl_mobile_${nextId++}`);
    const coordinator = createTaskImageCoordinator(dependencies);
    await coordinator.select("photos");
    await coordinator.select("camera");
    const [taskOwned, accepted] = coordinator.getViewStates().map((image) => image.uploadId);
    coordinator.associateUploadsWithTask("task_1", [taskOwned]);
    coordinator.beginUploadAfterSave();
    coordinator.discard();

    expect(coordinator.serialize().uploads.map((entry) => entry.uploadId)).toEqual([taskOwned, accepted]);
  });

  it("associates a newly tracked upload when ready sibling records are not local", async () => {
    const dependencies = createDependencies();
    const coordinator = createTaskImageCoordinator(dependencies);
    await coordinator.select("photos");
    coordinator.associateUploadsWithTask("task_1", ["upl_mobile_1"]);

    expect(coordinator.associateTaskImageOrder("task_1", ["ready_sibling", "image_new"])).toBe(true);
    expect(coordinator.pauseTaskImageUpload("task_1", "image_new")).toBe(true);
  });

  it("preserves every local upload when the server reports fewer active images", async () => {
    const dependencies = createDependencies();
    let nextId = 1;
    dependencies.createUploadId = vi.fn(() => `upl_mobile_${nextId++}`);
    const coordinator = createTaskImageCoordinator(dependencies);
    await coordinator.select("photos");
    await coordinator.select("camera");
    const uploadIds = coordinator.getViewStates().map((image) => image.uploadId);
    coordinator.associateUploadsWithTask("task_1", uploadIds);

    expect(coordinator.associateTaskImageOrder("task_1", ["image_1"])).toBe(true);
    expect(coordinator.getViewStates()).toHaveLength(2);
    expect(coordinator.pauseTaskUploads("task_1")).toBe(2);
  });

  it("runs no more than two uploads at once and keeps verification indeterminate", async () => {
    const dependencies = createDependencies();
    let nextId = 1;
    dependencies.createUploadId = vi.fn(() => `upl_mobile_${nextId++}`);
    type UploadResult = Awaited<ReturnType<TaskImageCoordinatorDependencies["upload"]>>;
    const uploads: Array<{ promise: Promise<UploadResult>; resolve: (value: UploadResult) => void }> = [];
    dependencies.upload = vi.fn(() => {
      const result = deferred<UploadResult>();
      uploads.push(result);
      return result.promise;
    });
    dependencies.verify = vi.fn(async () => ({ state: "ready" as const }));
    const coordinator = createTaskImageCoordinator(dependencies);

    for (let index = 0; index < 5; index += 1) await coordinator.select("photos");
    const completion = coordinator.beginUploadAfterSave();
    await Promise.resolve();

    expect(dependencies.upload).toHaveBeenCalledTimes(2);
    expect(coordinator.getViewStates().filter((image) => image.state === "uploading")).toHaveLength(2);
    expect(coordinator.getViewStates().some((image) => image.state === "verifying")).toBe(false);

    const providerResult = {
      publicId: "provider-private-id",
      version: 1,
      signature: "provider-response-signature",
      resourceType: "image",
      deliveryType: "authenticated",
      format: "jpg",
      width: 1600,
      height: 1200,
      bytes: 2_000_000,
      eager: [],
    } as Awaited<ReturnType<TaskImageCoordinatorDependencies["upload"]>>;
    uploads[0].resolve(providerResult);
    uploads[1].resolve(providerResult);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dependencies.upload).toHaveBeenCalledTimes(4);
    uploads[2].resolve(providerResult);
    uploads[3].resolve(providerResult);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(dependencies.upload).toHaveBeenCalledTimes(5);
    uploads[4].resolve(providerResult);
    await completion;
  });

  it("reports progress per image while leaving verification indeterminate", async () => {
    const dependencies = createDependencies();
    const result = deferred<Awaited<ReturnType<TaskImageCoordinatorDependencies["upload"]>>>();
    dependencies.upload = vi.fn(async (_uri, _grant, options) => {
      options?.onProgress(0.42);
      return result.promise;
    });
    dependencies.verify = vi.fn(async () => ({ state: "verifying" as const }));
    const coordinator = createTaskImageCoordinator(dependencies);
    await coordinator.select("photos");
    const completion = coordinator.beginUploadAfterSave();
    await Promise.resolve();

    expect(coordinator.getViewState()).toMatchObject({ state: "uploading", progress: 0.42 });
    result.resolve({
      publicId: "provider-private-id",
      version: 1,
      signature: "provider-response-signature",
      resourceType: "image",
      deliveryType: "authenticated",
      format: "jpg",
      width: 1600,
      height: 1200,
      bytes: 2_000_000,
      eager: [],
    });
    await completion;
    expect(coordinator.getViewState()).toMatchObject({ state: "verifying" });
    expect(coordinator.getViewState()?.progress).toBeUndefined();
  });

  it("retries transient failures on the settled schedule and preserves uploadId for manual retry", async () => {
    vi.useFakeTimers();
    try {
      const dependencies = createDependencies();
      dependencies.upload = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "network_error", retryable: true }))
        .mockResolvedValueOnce({
          publicId: "provider-private-id",
          version: 1,
          signature: "provider-response-signature",
          resourceType: "image",
          deliveryType: "authenticated",
          format: "jpg",
          width: 1600,
          height: 1200,
          bytes: 2_000_000,
          eager: [],
        });
      dependencies.verify = vi.fn(async () => ({ state: "ready" as const }));
      const coordinator = createTaskImageCoordinator(dependencies);
      await coordinator.select("photos");
      await coordinator.beginUploadAfterSave();

      expect(coordinator.getViewState()).toMatchObject({
        uploadId: "upl_mobile_1",
        state: "failed",
        failure: { code: "network_error", retryable: true },
        retryAt: expect.any(Number),
      });
      expect(dependencies.upload).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS[0]);
      expect(dependencies.upload).toHaveBeenCalledTimes(2);
      expect(coordinator.getViewState()).toMatchObject({ uploadId: "upl_mobile_1", state: "ready" });

      const manualDependencies = createDependencies();
      const manualUpload = manualDependencies.upload;
      manualDependencies.upload = vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "network_error", retryable: true }))
        .mockImplementation(manualUpload);
      manualDependencies.verify = vi.fn(async () => ({ state: "ready" as const }));
      const manualIssueGrant = vi.fn(manualDependencies.issueGrant);
      manualDependencies.issueGrant = manualIssueGrant;
      const manualCoordinator = createTaskImageCoordinator(manualDependencies);
      const retryStates: Array<{ taskImageId?: string; state: string }> = [];
      await manualCoordinator.select("photos");
      manualCoordinator.associateUploadsWithTask("task_1", ["upl_mobile_1"]);
      manualCoordinator.associateTaskImageOrder("task_1", ["image_1"]);
      await manualCoordinator.beginUploadAfterSave();
      const retryResult = await manualCoordinator.retryTaskImageUpload(
        "task_1",
        "image_1",
        (state) => retryStates.push({ taskImageId: state.taskImageId, state: state.state }),
      );
      expect(manualDependencies.upload).toHaveBeenCalledTimes(2);
      expect(retryResult).toMatchObject({ taskImageId: "image_1", state: "ready" });
      expect(retryStates).toEqual(expect.arrayContaining([
        { taskImageId: "image_1", state: "pending" },
        { taskImageId: "image_1", state: "ready" },
      ]));
      expect(manualIssueGrant.mock.calls.at(-1)?.[0]).toMatchObject({
        uploadId: "upl_mobile_1",
        requestKey: expect.stringContaining("upl_mobile_1"),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps budget-blocked uploads retryable and preserves their staged source", async () => {
    const dependencies = createDependencies();
    dependencies.issueGrant = vi.fn(async () => {
      throw Object.assign(new Error("ConvexError"), {
        data: { code: "usage_blocked", retryable: true },
      });
    });
    const coordinator = createTaskImageCoordinator(dependencies);

    await coordinator.select("photos");
    await coordinator.beginUploadAfterSave();

    expect(coordinator.getViewState()).toMatchObject({
      state: "failed",
      failure: { code: "usage_blocked", retryable: true },
      retryAt: expect.any(Number),
    });
  });

  it("prunes task-owned ready records after removing their durable source", async () => {
    const dependencies = createDependencies();
    const sourceStore = {
      persist: vi.fn(async () => ({ sourceKey: "upl_mobile_1.jpg", uri: "file:///private/durable.jpg" })),
      resolve: vi.fn(async () => "file:///private/durable.jpg"),
      remove: vi.fn(async () => undefined),
    };
    dependencies.verify = vi.fn(async () => ({ state: "ready" as const }));
    const coordinator = createTaskImageCoordinator({ ...dependencies, sourceStore });

    await coordinator.select("photos");
    coordinator.associateUploadsWithTask("task_1", ["upl_mobile_1"]);
    await coordinator.beginUploadAfterSave();

    expect(coordinator.serialize().uploads).toHaveLength(0);
    expect(sourceStore.remove).toHaveBeenCalledWith("upl_mobile_1.jpg");
  });

  it("does not advance the client attempt until the provider grant is accepted", async () => {
    const dependencies = createDependencies();
    dependencies.issueGrant = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("grant unavailable"), {
        code: "network_error",
        retryable: true,
      }))
      .mockResolvedValueOnce({
        uploadUrl: "https://api.cloudinary.example/private",
        signature: "signed-secret-capability",
        apiKey: "public-key",
        signedParameters: { timestamp: "1" },
        attempt: 1,
      });
    dependencies.verify = vi.fn(async () => ({ state: "ready" as const }));
    const coordinator = createTaskImageCoordinator(dependencies);

    await coordinator.select("photos");
    await coordinator.beginUploadAfterSave();
    expect(coordinator.serialize().uploads[0].attempt).toBe(0);

    await coordinator.retry("upl_mobile_1");

    expect(dependencies.issueGrant).toHaveBeenNthCalledWith(1, {
      uploadId: "upl_mobile_1",
      requestKey: "grant_upl_mobile_1_attempt_1",
    });
    expect(dependencies.issueGrant).toHaveBeenNthCalledWith(2, {
      uploadId: "upl_mobile_1",
      requestKey: "grant_upl_mobile_1_attempt_1",
    });
    expect(coordinator.serialize().uploads[0].attempt).toBe(1);
  });

  it("uses 5 seconds, 30 seconds, and 2 minutes before remaining manually retryable", async () => {
    vi.useFakeTimers();
    try {
      const dependencies = createDependencies();
      dependencies.upload = vi.fn()
        .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "network_error", retryable: true }))
        .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "network_error", retryable: true }))
        .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "network_error", retryable: true }))
        .mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "network_error", retryable: true }))
        .mockResolvedValueOnce({
          publicId: "provider-private-id",
          version: 1,
          signature: "provider-response-signature",
          resourceType: "image",
          deliveryType: "authenticated",
          format: "jpg",
          width: 1600,
          height: 1200,
          bytes: 2_000_000,
          eager: [],
        });
      const coordinator = createTaskImageCoordinator(dependencies);
      await coordinator.select("photos");
      await coordinator.beginUploadAfterSave();

      await vi.advanceTimersByTimeAsync(5_000);
      expect(dependencies.upload).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(dependencies.upload).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(dependencies.upload).toHaveBeenCalledTimes(4);
      expect(coordinator.getViewState()).toMatchObject({
        state: "failed",
        failure: { code: "network_error", retryable: true },
        retryAt: undefined,
      });

      await coordinator.retry("upl_mobile_1");
      expect(dependencies.upload).toHaveBeenCalledTimes(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps an unclassified transport failure retryable", async () => {
    const dependencies = createDependencies();
    const sourceStore = {
      persist: vi.fn(async () => ({ sourceKey: "upl_mobile_1.jpg", uri: "file:///private/durable.jpg" })),
      resolve: vi.fn(async () => "file:///private/durable.jpg"),
      remove: vi.fn(async () => undefined),
    };
    dependencies.issueGrant = vi.fn()
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValue({
        uploadUrl: "https://api.cloudinary.example/private",
        signature: "signed-secret-capability",
        apiKey: "public-key",
        signedParameters: { timestamp: "1" },
      });
    const coordinator = createTaskImageCoordinator({ ...dependencies, sourceStore });
    await coordinator.select("photos");
    await coordinator.beginUploadAfterSave();

    expect(coordinator.getViewState()).toMatchObject({
      state: "failed",
      failure: { code: "upload_failed", retryable: true },
    });
    expect(sourceStore.remove).not.toHaveBeenCalled();

    await coordinator.retry("upl_mobile_1");
    expect(dependencies.issueGrant).toHaveBeenCalledTimes(2);
  });

  it("reconciles an ambiguous attempt before creating a new provider attempt", async () => {
    vi.useFakeTimers();
    try {
      const dependencies = createDependencies();
      dependencies.upload = vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error("timeout"), { code: "network_error", retryable: true }))
        .mockResolvedValueOnce({
          publicId: "provider-private-id",
          version: 2,
          signature: "provider-response-signature",
          resourceType: "image",
          deliveryType: "authenticated",
          format: "jpg",
          width: 1600,
          height: 1200,
          bytes: 2_000_000,
          eager: [],
        });
      dependencies.reconcileAttempt = vi.fn(async () => ({ status: "absent" as const }));
      const coordinator = createTaskImageCoordinator(dependencies);
      await coordinator.select("photos");
      await coordinator.beginUploadAfterSave();
      await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS[0]);

      expect(dependencies.reconcileAttempt).toHaveBeenCalledWith({ uploadId: "upl_mobile_1", attempt: 1 });
      expect(dependencies.issueGrant).toHaveBeenCalledTimes(2);
      expect(dependencies.upload).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("recycles a present provider asset on explicit retry instead of waiting forever", async () => {
    const dependencies = createDependencies();
    dependencies.upload = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error("callback lost"), {
        code: "upload_failed",
        retryable: true,
      }))
      .mockResolvedValueOnce({
        publicId: "provider-private-id-2",
        version: 2,
        signature: "provider-response-signature",
        resourceType: "image",
        deliveryType: "authenticated",
        format: "jpg",
        width: 1600,
        height: 1200,
        bytes: 2_000_000,
        eager: [],
      });
    dependencies.reconcileAttempt = vi.fn(async ({ restartAttempt }) =>
      restartAttempt
        ? { status: "absent" as const, attempt: 1 }
        : { status: "verifying" as const, attempt: 1 }
    );
    dependencies.verify = vi.fn(async () => ({ state: "ready" as const }));
    const coordinator = createTaskImageCoordinator(dependencies);

    await coordinator.select("photos");
    await coordinator.beginUploadAfterSave();
    await coordinator.retry("upl_mobile_1");

    expect(dependencies.reconcileAttempt).toHaveBeenCalledWith({
      uploadId: "upl_mobile_1",
      attempt: 1,
      restartAttempt: true,
    });
    expect(dependencies.issueGrant).toHaveBeenCalledTimes(2);
    expect(dependencies.upload).toHaveBeenCalledTimes(2);
    expect(coordinator.getViewState()).toMatchObject({
      uploadId: "upl_mobile_1",
      state: "ready",
    });
  });

  it("hydrates interrupted work, merges by uploadId, and does not duplicate a live attempt", async () => {
    const dependencies = createDependencies();
    const sourceStore = {
      persist: vi.fn(async () => ({ sourceKey: "upl_mobile_1.jpg", uri: "file:///private/durable.jpg" })),
      resolve: vi.fn(async () => "file:///private/durable.jpg"),
      remove: vi.fn(async () => undefined),
    };
    const store = {
      load: vi.fn(async () => ({
        version: 2,
        uploads: [{
          uploadId: "upl_mobile_1",
          state: "uploading",
          sourceKey: "upl_mobile_1.jpg",
          encodingClass: "jpeg",
          width: 1600,
          height: 1200,
          bytes: 2_000_000,
          attempt: 1,
          retryCount: 0,
          needsReconciliation: false,
          paused: false,
        }],
      })),
      save: vi.fn(async () => undefined),
    };
    dependencies.reconcileAttempt = vi.fn(async () => ({ status: "uploading" as const }));
    const coordinator = createTaskImageCoordinator({
      ...dependencies,
      ownerScope: () => "owner-a",
      manifestStore: store,
      sourceStore,
    });

    await coordinator.reconcileOnForeground();

    expect(dependencies.reconcileAttempt).toHaveBeenCalledWith({ uploadId: "upl_mobile_1", attempt: 1 });
    expect(dependencies.issueGrant).not.toHaveBeenCalled();
    expect(coordinator.getViewState()).toMatchObject({ uploadId: "upl_mobile_1", state: "verifying" });
    expect(coordinator.serialize().uploads[0].sourceKey).toBe("upl_mobile_1.jpg");
  });

  it("restores a recoverably removed image after coordinator hydration", async () => {
    const dependencies = createDependencies();
    const store = {
      load: vi.fn(async () => ({
        version: 2,
        uploads: [{
          uploadId: "upl_mobile_1",
          taskId: "task_1",
          taskImageId: "image_1",
          state: "pending",
          sourceKey: "upl_mobile_1.jpg",
          attempt: 1,
          retryCount: 0,
          needsReconciliation: false,
          paused: true,
          recoverablyRemoved: true,
        }],
      })),
      save: vi.fn(async () => undefined),
    };
    const coordinator = createTaskImageCoordinator({
      ...dependencies,
      ownerScope: () => "owner-a",
      manifestStore: store,
      sourceStore: {
        persist: vi.fn(async () => ({ sourceKey: "upl_mobile_1.jpg", uri: "file:///private/durable.jpg" })),
        resolve: vi.fn(async () => "file:///private/durable.jpg"),
        remove: vi.fn(async () => undefined),
      },
    });

    await coordinator.hydrate();
    expect(await coordinator.resumeTaskImageUpload("task_1", "image_1")).toBe(true);
    expect(dependencies.issueGrant).toHaveBeenCalledTimes(1);
  });

  it("keeps an unavailable reconciliation actionable instead of issuing a duplicate attempt", async () => {
    vi.useFakeTimers();
    try {
      const dependencies = createDependencies();
      dependencies.upload = vi.fn().mockRejectedValueOnce(
        Object.assign(new Error("timeout"), { code: "network_error", retryable: true })
      );
      dependencies.reconcileAttempt = vi.fn(async () => ({ status: "unknown" as const }));
      const coordinator = createTaskImageCoordinator(dependencies);
      await coordinator.select("photos");
      await coordinator.beginUploadAfterSave();
      await vi.advanceTimersByTimeAsync(UPLOAD_RETRY_DELAYS_MS[0]);

      expect(dependencies.issueGrant).toHaveBeenCalledTimes(1);
      expect(coordinator.getViewState()).toMatchObject({
        state: "failed",
        failure: { code: "provider_unavailable", retryable: true },
        retryAt: expect.any(Number),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("sanitizes malformed persisted entries before they can be written back", async () => {
    const saved: unknown[] = [];
    const coordinator = createTaskImageCoordinator({
      ...createDependencies(),
      ownerScope: () => "owner-a",
      manifestStore: {
        load: vi.fn(async () => ({
          version: 2,
          uploads: [{
            uploadId: "upl_mobile_1",
            state: "failed",
            sourceKey: "file:///private/source.jpg",
            failure: { code: "network_error", retryable: true, rawResponse: "provider-secret" },
            attempt: 0,
            retryCount: 0,
            needsReconciliation: false,
            paused: false,
          }],
        })),
        save: vi.fn(async (_scope, manifest) => {
          saved.push(manifest);
        }),
      },
    });

    await coordinator.hydrate();

    const serialized = JSON.stringify(saved.at(-1));
    expect(serialized).not.toMatch(/file:\/\/|rawResponse|provider-secret/);
    expect(serialized).toContain("network_error");
  });

  it("pauses recoverable deletion work, resumes it, and cleans app-owned sources safely", async () => {
    const dependencies = createDependencies();
    const sourceStore = {
      persist: vi.fn(async () => ({ sourceKey: "upl_mobile_1.jpg", uri: "file:///private/durable.jpg" })),
      resolve: vi.fn(async () => "file:///private/durable.jpg"),
      remove: vi.fn(async () => undefined),
    };
    dependencies.verify = vi.fn(async () => ({ state: "ready" as const }));
    const coordinator = createTaskImageCoordinator({ ...dependencies, sourceStore });
    await coordinator.select("photos");
    coordinator.associateUploadsWithTask("task_1", ["upl_mobile_1"]);
    const paused = coordinator.pauseTaskUploads("task_1");
    expect(paused).toBe(1);
    expect(coordinator.getViewState()).toMatchObject({ state: "pending" });

    await coordinator.resumeTaskUploads("task_1");
    await coordinator.beginUploadAfterSave();
    expect(sourceStore.remove).toHaveBeenCalledWith("upl_mobile_1.jpg");

    await coordinator.remove("upl_mobile_1");
    expect(sourceStore.remove).toHaveBeenCalledWith("upl_mobile_1.jpg");
  });

  it("discards paused Task uploads after the deletion recovery window expires", async () => {
    let currentTime = 1_000;
    const dependencies = createDependencies();
    const sourceStore = {
      persist: vi.fn(async () => ({ sourceKey: "upl_mobile_1.jpg", uri: "file:///private/durable.jpg" })),
      resolve: vi.fn(async () => "file:///private/durable.jpg"),
      remove: vi.fn(async () => undefined),
    };
    dependencies.now = () => currentTime;
    dependencies.sourceStore = sourceStore;
    const coordinator = createTaskImageCoordinator(dependencies);
    await coordinator.select("photos");
    coordinator.associateUploadsWithTask("task_1", ["upl_mobile_1"]);
    expect(coordinator.pauseTaskUploads("task_1")).toBe(1);
    expect(coordinator.serialize().uploads[0]).toMatchObject({
      taskId: "task_1",
      paused: true,
    });

    currentTime += 30 * 60 * 1000;
    await coordinator.reconcileOnForeground();

    expect(coordinator.serialize().uploads).toHaveLength(0);
    expect(sourceStore.remove).toHaveBeenCalledWith("upl_mobile_1.jpg");
  });

  it("discards persisted Task uploads whose recovery deadline passed while the app was closed", async () => {
    const sourceStore = {
      persist: vi.fn(async () => ({ sourceKey: "upl_mobile_1.jpg", uri: "file:///private/durable.jpg" })),
      resolve: vi.fn(async () => "file:///private/durable.jpg"),
      remove: vi.fn(async () => undefined),
    };
    const coordinator = createTaskImageCoordinator({
      ...createDependencies(),
      now: () => 2_000,
      ownerScope: () => "owner-a",
      sourceStore,
      manifestStore: {
        load: vi.fn(async () => ({
          version: 2,
          uploads: [{
            uploadId: "upl_mobile_1",
            taskId: "task_1",
            state: "pending",
            sourceKey: "upl_mobile_1.jpg",
            attempt: 0,
            retryCount: 0,
            taskDeletionExpiresAt: 1_000,
            needsReconciliation: false,
            paused: true,
          }],
        })),
        save: vi.fn(async () => undefined),
      },
    });

    await coordinator.hydrate();

    expect(coordinator.serialize().uploads).toHaveLength(0);
    expect(sourceStore.remove).toHaveBeenCalledWith("upl_mobile_1.jpg");
  });

  it("pauses only the removed Task image and keeps it paused through Task restoration", async () => {
    const dependencies = createDependencies();
    let nextId = 1;
    dependencies.createUploadId = vi.fn(() => `upl_mobile_${nextId++}`);
    dependencies.abortUpload = vi.fn();
    const coordinator = createTaskImageCoordinator(dependencies);
    await coordinator.select("photos");
    await coordinator.select("camera");
    const uploadIds = coordinator.getViewStates().map((image) => image.uploadId);
    coordinator.associateUploadsWithTask("task_1", uploadIds);
    expect(coordinator.associateTaskImageOrder("task_1", ["image_1", "image_2"])).toBe(true);

    expect(coordinator.pauseTaskImageUpload("task_1", "image_1")).toBe(true);
    expect(dependencies.abortUpload).toHaveBeenCalledWith({ uploadId: uploadIds[0] });
    await coordinator.resumeTaskUploads("task_1");
    expect(coordinator.getViewStates()[0]).toMatchObject({ state: "pending" });

    await coordinator.resumeTaskImageUpload("task_1", "image_1");
    expect(coordinator.getViewStates()[0]).toMatchObject({ state: "verifying" });
  });

  it("removes all task-owned records and sources after permanent deletion", async () => {
    const dependencies = createDependencies();
    const sourceStore = {
      persist: vi.fn(async () => ({ sourceKey: "upl_mobile_1.jpg", uri: "file:///private/durable.jpg" })),
      resolve: vi.fn(async () => "file:///private/durable.jpg"),
      remove: vi.fn(async () => undefined),
    };
    const coordinator = createTaskImageCoordinator({ ...dependencies, sourceStore });
    await coordinator.select("photos");
    coordinator.associateUploadsWithTask("task_1", ["upl_mobile_1"]);

    await coordinator.discardTaskUploads("task_1");

    expect(coordinator.serialize().uploads).toHaveLength(0);
    expect(sourceStore.remove).toHaveBeenCalledWith("upl_mobile_1.jpg");
  });

  it("does not let an in-flight upload complete into a recoverably paused record", async () => {
    const dependencies = createDependencies();
    const firstUpload = deferred<Awaited<ReturnType<TaskImageCoordinatorDependencies["upload"]>>>();
    dependencies.upload = vi.fn()
      .mockImplementationOnce(async () => firstUpload.promise)
      .mockResolvedValue({
        publicId: "provider-private-id",
        version: 1,
        signature: "provider-response-signature",
        resourceType: "image",
        deliveryType: "authenticated",
        format: "jpg",
        width: 1600,
        height: 1200,
        bytes: 2_000_000,
        eager: [],
      });
    dependencies.verify = vi.fn(async () => ({ state: "ready" as const }));
    const coordinator = createTaskImageCoordinator(dependencies);
    await coordinator.select("photos");
    coordinator.associateUploadsWithTask("task_1", ["upl_mobile_1"]);
    const completion = coordinator.beginUploadAfterSave();
    await Promise.resolve();

    coordinator.pauseTaskUploads("task_1");
    firstUpload.resolve({
      publicId: "provider-private-id",
      version: 1,
      signature: "provider-response-signature",
      resourceType: "image",
      deliveryType: "authenticated",
      format: "jpg",
      width: 1600,
      height: 1200,
      bytes: 2_000_000,
      eager: [],
    });
    await completion;
    expect(coordinator.getViewState()).toMatchObject({ state: "pending" });

    await coordinator.resumeTaskUploads("task_1");
    await coordinator.beginUploadAfterSave();
    expect(dependencies.upload).toHaveBeenCalledTimes(2);
    expect(coordinator.getViewState()).toBeNull();
    expect(coordinator.serialize().uploads).toHaveLength(0);
  });
});
