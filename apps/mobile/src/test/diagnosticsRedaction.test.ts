import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
import {
  getDiagnosticsSnapshot,
  recordDiagnosticEvent,
} from "../lib/diagnostics";
import { mobileLogger } from "../lib/logger";

describe("Task-image diagnostics boundary", () => {
  it("redacts manifests, captions, identities, URLs, and local paths", async () => {
    recordDiagnosticEvent("task_image_test", "warn", {
      taskImageId: "image-secret",
      uploadId: "upload-secret",
      providerPublicId: "provider-secret",
      url: "https://secret.example/signed",
      localPath: "file:///private/source.jpg",
      caption: "Private caption",
      imageCollection: { active: [{ taskImageId: "nested-secret" }] },
      failureCode: "normalization_failed",
      retryable: false,
      activeCount: 2,
    });

    const events = await getDiagnosticsSnapshot();
    const meta = events.findLast((event) => event.event === "task_image_test")?.meta;

    expect(meta).toMatchObject({
      taskImageId: "[REDACTED]",
      uploadId: "[REDACTED]",
      providerPublicId: "[REDACTED]",
      url: "[REDACTED]",
      localPath: "[REDACTED]",
      caption: "[REDACTED]",
      imageCollection: "[REDACTED]",
      failureCode: "normalization_failed",
      retryable: false,
      activeCount: 2,
    });
    expect(JSON.stringify(meta)).not.toMatch(
      /image-secret|upload-secret|provider-secret|secret\.example|file:\/\/|Private caption|nested-secret/
    );
  });

  it("redacts secrets, arbitrary URL/path values, binaries, and provider context", async () => {
    recordDiagnosticEvent("task_image_strict_redaction", "error", {
      apiSecret: "top-secret",
      signingCredential: "credential-secret",
      callback: "https://secret.example/callback",
      source: "content://private/image/1",
      filePath: "/data/user/0/private.jpg",
      imageBinary: new Uint8Array([80, 82, 73, 86, 65, 84, 69]),
      providerId: "provider-identity",
      providerContext: { publicId: "opaque-provider-id", signature: "signed-secret" },
      errorMessage: "failed for https://secret.example/image",
      failureCode: "provider_usage_unavailable",
      failureCount: 4,
      pooledPercentage: 71,
      storageBytes: 4_000,
    });

    const events = await getDiagnosticsSnapshot();
    const meta = events.findLast((event) => event.event === "task_image_strict_redaction")?.meta;
    expect(meta).toMatchObject({
      apiSecret: "[REDACTED]",
      signingCredential: "[REDACTED]",
      callback: "[REDACTED]",
      source: "[REDACTED]",
      filePath: "[REDACTED]",
      imageBinary: "[REDACTED]",
      providerId: "[REDACTED]",
      providerContext: "[REDACTED]",
      errorMessage: "[REDACTED]",
      failureCode: "provider_usage_unavailable",
      failureCount: 4,
      pooledPercentage: 71,
      storageBytes: 4_000,
    });
    expect(JSON.stringify(meta)).not.toMatch(
      /top-secret|credential-secret|secret\.example|content:\/\/|private\.jpg|provider-identity|opaque-provider-id|signed-secret|80,82,73/
    );
  });

  it("applies the same redaction before writing console logs", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    mobileLogger.warn("task_image_provider_failure", {
      apiSecret: "console-secret",
      delivery: "https://secret.example/signed",
      taskImageId: "image-private",
      failureCode: "provider_unavailable",
      failureCount: 1,
    });

    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain("provider_unavailable");
    expect(line).toContain("failureCount");
    expect(line).not.toMatch(/console-secret|secret\.example|image-private/);
    warn.mockRestore();
  });
});
