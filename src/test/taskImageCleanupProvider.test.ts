import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteProviderAsset } from "../../convex/taskImageProvider";

const provider = {
  cloudName: "cleanup-cloud",
  apiKey: "public-key",
  apiSecret: "server-secret",
  callbackUrl: "https://example.convex.site/cloudinary/task-image-callback",
};

describe("Task-image provider cleanup", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("deletes the authenticated asset with CDN invalidation", async () => {
    vi.setSystemTime(new Date(10_000));
    let form: URLSearchParams | undefined;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = String(init?.body);
      form = new URLSearchParams(body);
      expect(body).toContain("invalidate=true");
      expect(body).toContain("type=authenticated");
      expect(body).not.toContain("server-secret");
      return new Response(JSON.stringify({ result: "ok" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteProviderAsset({ provider, publicId: "pravah-task-images/opaque" })).resolves.toBe(
      "deleted"
    );

    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        "invalidate=true&public_id=pravah-task-images/opaque&timestamp=10&type=authenticatedserver-secret"
      )
    );
    const expectedSignature = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    expect(form?.get("signature")).toBe(expectedSignature);
    expect(form?.get("signature_algorithm")).toBe("sha256");
    vi.useRealTimers();
  });

  it.each([
    ["not found", "absent"],
    ["rate limited", "retry"],
  ] as const)("classifies provider result %s as %s", async (kind, expected) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        kind === "not found"
          ? new Response(JSON.stringify({ result: "not found" }), { status: 200 })
          : new Response("slow down", { status: 429 })
      )
    );
    await expect(deleteProviderAsset({ provider, publicId: "pravah-task-images/opaque" })).resolves.toBe(
      expected
    );
  });

  it("treats an ambiguous response as terminal only after presence confirms absence", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ result: "maybe" }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ resources: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteProviderAsset({ provider, publicId: "pravah-task-images/opaque" })).resolves.toBe(
      "absent"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps a timeout or network ambiguity retryable when presence remains unknown", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(new Response("provider unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteProviderAsset({ provider, publicId: "pravah-task-images/opaque" })).resolves.toBe(
      "retry"
    );
  });
});
