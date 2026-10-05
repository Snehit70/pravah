import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  create: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  cancel: vi.fn(),
}));
vi.mock("expo-file-system", () => ({
  File: class {
    exists = true;
    createUploadTask(...args: unknown[]) {
      mocks.create(...args);
      return { uploadAsync: mocks.upload, cancel: mocks.cancel };
    }
  },
  Directory: class {},
  Paths: {},
  FileMode: {},
  UploadType: { MULTIPART: 1 },
}));
vi.mock("expo-clipboard", () => ({}));
vi.mock("expo-image-picker", () => ({}));
vi.mock("expo-image-manipulator", () => ({
  SaveFormat: {},
  manipulateAsync: vi.fn(),
}));
vi.mock("../lib/logger", () => ({
  mobileLogger: { info: mocks.info, warn: mocks.warn },
}));
import {
  abortPreparedTaskImageUpload,
  uploadPreparedTaskImage,
} from "../lib/taskImageNative";
const grant = {
  attempt: 3,
  uploadUrl: "https://provider.test/upload",
  apiKey: "private-key",
  signature: "private-signature",
  signedParameters: { public_id: "public" },
};
const success = {
  public_id: "public",
  version: 123,
  signature: "result-signature",
  resource_type: "image",
  type: "authenticated",
  format: "jpg",
  width: 640,
  height: 480,
  bytes: 50_000,
};
beforeEach(() => vi.clearAllMocks());
describe("native transfer confirmation", () => {
  it("does not emit receipt when byte progress reaches 100%", async () => {
    let finish!: (response: { status: number; body: string }) => void;
    mocks.upload.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const result = uploadPreparedTaskImage(
      "file:///private/source.jpg",
      grant,
      { uploadId: "upl_private", onProgress: vi.fn() },
    );
    const options = mocks.create.mock.calls[0][1];
    options.onProgress({ bytesSent: 50_000, totalBytes: 50_000 });
    expect(mocks.info).not.toHaveBeenCalledWith(
      "image_transfer_received",
      expect.anything(),
    );
    finish({ status: 200, body: JSON.stringify(success) });
    await result;
    expect(mocks.info).toHaveBeenCalledWith(
      "image_transfer_received",
      expect.objectContaining({ httpStatus: 200, attempt: 3 }),
    );
  });
  it("does not let an old completion remove the newer attempt's cancellation handle", async () => {
    let finishFirst!: (value: { status: number; body: string }) => void;
    let finishSecond!: (value: { status: number; body: string }) => void;
    mocks.upload
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishFirst = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishSecond = resolve;
        }),
      );
    const options = { uploadId: "upl_private", onProgress: vi.fn() };
    const first = uploadPreparedTaskImage(
      "file:///private/source.jpg",
      grant,
      options,
    );
    const second = uploadPreparedTaskImage(
      "file:///private/source.jpg",
      { ...grant, attempt: 4 },
      options,
    );
    finishFirst({ status: 200, body: JSON.stringify(success) });
    await first;
    abortPreparedTaskImageUpload(options.uploadId);
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    finishSecond({ status: 200, body: JSON.stringify(success) });
    await second;
  });
  it("records an actionable HTTP failure without provider body, path, or credentials", async () => {
    mocks.upload.mockResolvedValue({
      status: 400,
      body: JSON.stringify({
        error: {
          message: "Invalid Signature private-signature file:///secret",
        },
      }),
    });
    await expect(
      uploadPreparedTaskImage("file:///private/source.jpg", grant, {
        uploadId: "upl_private",
        onProgress: vi.fn(),
      }),
    ).rejects.toMatchObject({ code: "upload_failed", retryable: true });
    expect(mocks.warn).toHaveBeenCalledWith(
      "image_transfer_failed",
      expect.objectContaining({
        category: "provider_signature",
        httpStatus: 400,
        attempt: 3,
      }),
    );
    const exported = JSON.stringify([
      ...mocks.info.mock.calls,
      ...mocks.warn.mock.calls,
    ]);
    expect(exported).not.toMatch(
      /private-signature|private-key|file:\/\/|upl_private/,
    );
  });
  it("retains an observable transport category on a native timeout", async () => {
    mocks.upload.mockRejectedValue(
      new Error("request timed out at private path"),
    );
    await expect(
      uploadPreparedTaskImage("file:///private/source.jpg", grant),
    ).rejects.toMatchObject({ code: "upload_failed", retryable: true });
    expect(mocks.warn).toHaveBeenCalledWith(
      "image_transfer_failed",
      expect.objectContaining({ category: "transport_timeout" }),
    );
  });
});
