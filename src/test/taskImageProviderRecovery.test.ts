import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CARD_TRANSFORMATION,
  DETAIL_TRANSFORMATION,
  recoverProviderAsset,
} from "../../convex/taskImageProvider";
import {
  readRecoveryVariant,
  webpDimensions,
} from "../../convex/taskImageVariantRecovery";
const provider = {
  cloudName: "fixture",
  apiKey: "test-key",
  apiSecret: "test-secret",
  callbackUrl: "https://example.test",
};
const resource = {
  public_id: "public",
  version: 123,
  resource_type: "image",
  type: "authenticated",
  format: "jpg",
  width: 1920,
  height: 1440,
  bytes: 900_000,
  derived: [
    { transformation: CARD_TRANSFORMATION },
    { transformation: DETAIL_TRANSFORMATION },
  ],
};
function webp(width: number, height: number) {
  const bytes = new Uint8Array(30);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  text(8, "WEBP");
  text(12, "VP8X");
  for (const [offset, value] of [
    [24, width - 1],
    [27, height - 1],
  ]) {
    bytes[offset] = value & 255;
    bytes[offset + 1] = (value >>> 8) & 255;
    bytes[offset + 2] = (value >>> 16) & 255;
  }
  return bytes;
}
afterEach(() => vi.unstubAllGlobals());
describe("trusted provider recovery", () => {
  it("recovers variants even when Admin metadata omits dimensions", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json(resource))
      .mockResolvedValueOnce(new Response(webp(640, 480)))
      .mockResolvedValueOnce(new Response(webp(1600, 1200)));
    vi.stubGlobal("fetch", fetch);
    expect(
      await recoverProviderAsset(provider, "public", "jpeg"),
    ).toMatchObject({
      status: "ready",
      card: { width: 640, height: 480 },
      detail: { width: 1600, height: 1200 },
    });
    expect(fetch.mock.calls[1][0]).toMatch(
      /^https:\/\/res.cloudinary.com\/fixture\/image\/authenticated\/s--/,
    );
  });
  it("rejects mismatched provider identity before fetching image bytes", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ ...resource, public_id: "another-attempt" }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await recoverProviderAsset(provider, "public", "jpeg")).toEqual({
      status: "unknown",
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves preparation when fixed variants have not been generated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ ...resource, derived: [] })),
    );
    expect(
      await recoverProviderAsset(provider, "public", "jpeg"),
    ).toMatchObject({ status: "verifying" });
  });
  it.each([401, 429, 503])(
    "treats provider HTTP %s as ambiguous",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status })),
      );
      expect(await recoverProviderAsset(provider, "public", "jpeg")).toEqual({
        status: "unknown",
      });
    },
  );
  it("does not accept HTML or animated WebP as a ready variant", () => {
    expect(
      webpDimensions(new TextEncoder().encode("<html>bad resource</html>")),
    ).toBeNull();
    const bytes = webp(640, 480);
    bytes[20] = 2;
    expect(webpDimensions(bytes)).toBeNull();
  });
  it("stops reading a variant beyond its byte budget", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(100))),
    );
    expect(await readRecoveryVariant("https://fixture.test", 50)).toBeNull();
  });
});
