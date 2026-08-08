import { describe, expect, it, vi } from "vitest";
import {
  CARD_TRANSFORMATION,
  DETAIL_TRANSFORMATION,
  buildDeliveryUrl,
  buildEagerWebhookVerificationInput,
  buildUploadGrant,
  checkProviderAssetPresence,
  verifyProviderUploadMaster,
  verifyProviderWebhookResult,
  verifyWebhookSignature,
} from "../../convex/taskImageProvider";

const provider = {
  cloudName: "demo-cloud",
  apiKey: "public-key",
  apiSecret: "abcd",
  callbackUrl: "https://example.convex.site/cloudinary/task-image-callback",
};

describe("Task-image Cloudinary policy", () => {
  it("checks authenticated image presence through the Admin API resource path", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(
        "https://api.cloudinary.com/v1_1/demo-cloud/resources/image/authenticated?public_ids[]=pravah%2Fopaque"
      );
      return new Response(JSON.stringify({ resources: [{}] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(checkProviderAssetPresence({
      provider,
      publicId: "pravah/opaque",
    })).resolves.toBe("present");

    vi.unstubAllGlobals();
  });

  it("builds one exact SHA-256 authenticated upload grant without leaking authority", async () => {
    const grant = await buildUploadGrant({
      provider,
      publicId: "pravah-task-images/opaque123",
      timestamp: 1_776_245_400,
      encodingClass: "jpeg",
    });

    expect(grant).toEqual({
      cloudName: "demo-cloud",
      apiKey: "public-key",
      uploadUrl: "https://api.cloudinary.com/v1_1/demo-cloud/image/upload",
      expiresAt: 1_776_249_000,
      discardAfter: 1_776_246_000,
      signatureAlgorithm: "sha256",
      signature: "c8e48aa409d8538ec22620dbd54b0ea12f1986997cab47fba5a17178719cd1a4",
      signedParameters: {
        allowed_formats: "jpg,png",
        backup: "false",
        eager:
          "c_limit,h_640,w_640/cs_srgb,f_webp,q_auto:eco|c_limit,h_1600,w_1600/cs_srgb,f_webp,q_auto:good",
        eager_async: "true",
        eager_notification_url: provider.callbackUrl,
        format: "jpg",
        notification_url: provider.callbackUrl,
        overwrite: "false",
        public_id: "pravah-task-images/opaque123",
        return_delete_token: "false",
        timestamp: "1776245400",
        transformation: "c_limit,h_2560,w_2560/cs_srgb,f_jpg,q_85",
        type: "authenticated",
        unique_filename: "false",
        use_filename: "false",
      },
    });
    expect(JSON.stringify(grant)).not.toContain("abcd");
    expect(JSON.stringify(grant)).not.toMatch(
      /"delete_token":|return_delete_token":"true"|CLOUDINARY_URL|secure_url/
    );
  });

  it("accepts readiness only after a signed master and signed-webhook variants verify", async () => {
    const response = {
      publicId: "pravah-task-images/opaque123",
      version: 123,
      signature: "95517750580dfd59a8708e24b5fce2551cdfb655edaf9f4d2e04b0af59e0063e",
      resourceType: "image",
      deliveryType: "authenticated",
      format: "jpg",
      width: 1600,
      height: 1200,
      bytes: 2_000_000,
      eager: [
        {
          transformation: CARD_TRANSFORMATION,
          format: "webp",
          width: 640,
          height: 480,
          bytes: 300_000,
        },
        {
          transformation: DETAIL_TRANSFORMATION,
          format: "webp",
          width: 1600,
          height: 1200,
          bytes: 1_500_000,
        },
      ],
    } as const;

    const expected = {
      apiSecret: "abcd",
      expectedPublicId: "pravah-task-images/opaque123",
      expectedEncodingClass: "jpeg" as const,
    };
    const verifiedMaster = await verifyProviderUploadMaster(response, expected);
    expect(verifiedMaster).toMatchObject({ ok: true, publicId: response.publicId, version: 123 });
    expect(verifiedMaster).not.toHaveProperty("variants");

    const webhookResponse = buildEagerWebhookVerificationInput({
      publicId: response.publicId,
      version: response.version,
      master: response,
      eager: response.eager,
    });
    expect(
      await verifyProviderWebhookResult(webhookResponse, expected)
    ).toMatchObject({ ok: true, publicId: response.publicId, version: 123 });

    expect(
      await verifyProviderWebhookResult(
        { ...webhookResponse, eager: response.eager.slice(0, 1) },
        expected
      )
    ).toEqual({ ok: false, failureCode: "normalization_failed" });

    expect(
      await verifyProviderWebhookResult(
        {
          ...webhookResponse,
          eager: [response.eager[0], { ...response.eager[1], bytes: 2 * 1024 * 1024 + 1 }],
        },
        expected
      )
    ).toEqual({ ok: false, failureCode: "variant_too_large" });
  });

  it("does not let client-forwarded eager metadata elevate a master to ready", async () => {
    const result = await verifyProviderUploadMaster({
      publicId: "pravah-task-images/opaque123",
      version: 123,
      signature: "95517750580dfd59a8708e24b5fce2551cdfb655edaf9f4d2e04b0af59e0063e",
      resourceType: "image",
      deliveryType: "authenticated",
      format: "jpg",
      width: 1600,
      height: 1200,
      bytes: 2_000_000,
      eager: [
        {
          transformation: CARD_TRANSFORMATION,
          format: "webp",
          width: 640,
          height: 480,
          bytes: 1,
        },
        {
          transformation: DETAIL_TRANSFORMATION,
          format: "webp",
          width: 1600,
          height: 1200,
          bytes: 1,
        },
      ],
    }, {
        apiSecret: "abcd",
        expectedPublicId: "pravah-task-images/opaque123",
        expectedEncodingClass: "jpeg",
      });

    expect(result).toMatchObject({ ok: true });
    expect(result).not.toHaveProperty("variants");
  });

  it("verifies callback raw bodies with SHA-256 and rejects tampering or stale timestamps", async () => {
    const body = '{"public_id":"pravah-task-images/opaque123"}';
    expect(
      await verifyWebhookSignature({
        rawBody: body,
        timestamp: 1_776_245_400,
        signature: "9a3aec295ed266cb3073d56a17136ec375cc308d9de9cfaa9ff2d8d1067df994",
        apiSecret: "abcd",
        nowSeconds: 1_776_245_460,
      })
    ).toBe(true);
    expect(
      await verifyWebhookSignature({
        rawBody: `${body} `,
        timestamp: 1_776_245_400,
        signature: "9a3aec295ed266cb3073d56a17136ec375cc308d9de9cfaa9ff2d8d1067df994",
        apiSecret: "abcd",
        nowSeconds: 1_776_245_460,
      })
    ).toBe(false);
    expect(
      await verifyWebhookSignature({
        rawBody: body,
        timestamp: 1_776_245_400,
        signature: "9a3aec295ed266cb3073d56a17136ec375cc308d9de9cfaa9ff2d8d1067df994",
        apiSecret: "abcd",
        nowSeconds: 1_776_252_601,
      })
    ).toBe(false);
  });

  it("signs only the fixed eager delivery path", async () => {
    await expect(
      buildDeliveryUrl({
        cloudName: "demo-cloud",
        apiSecret: "abcd",
        publicId: "pravah-task-images/opaque123",
        version: 123,
        variant: "card",
      })
    ).resolves.toBe(
      "https://res.cloudinary.com/demo-cloud/image/authenticated/s--E4CIRKtj--/c_limit,h_640,w_640/cs_srgb,f_webp,q_auto:eco/v123/pravah-task-images/opaque123.webp"
    );
  });
});
