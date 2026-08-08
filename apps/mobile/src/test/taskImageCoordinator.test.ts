import { describe, expect, it, vi } from "vitest";
import {
  createTaskImageCoordinator,
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
      expect.objectContaining({ signature: "signed-secret-capability" })
    );
    expect(dependencies.verify).toHaveBeenCalledWith(
      expect.not.objectContaining({ secureUrl: expect.anything() })
    );
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
    expect(coordinator.serialize()).toEqual({
      version: 1,
      draft: {
        uploadId: "upl_mobile_1",
        state: "failed",
        failure: { code: "animated_image", retryable: false },
      },
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

    coordinator.remove(ids[0]);
    expect(coordinator.getViewStates()).toHaveLength(4);
    await coordinator.select("paste");
    expect(coordinator.getViewStates()).toHaveLength(5);
    expect(coordinator.getUploadIdsForSave()).toHaveLength(5);
  });
});
