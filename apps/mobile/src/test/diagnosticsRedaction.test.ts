import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  AppState: { addEventListener: vi.fn(() => ({ remove: vi.fn() })) },
}));
import {
  getDiagnosticsSnapshot,
  recordDiagnosticEvent,
} from "../lib/diagnostics";

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
});
