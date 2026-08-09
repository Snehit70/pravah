export const CARD_TRANSFORMATION =
  "c_limit,h_640,w_640/cs_srgb,f_webp,q_auto:eco";
export const DETAIL_TRANSFORMATION =
  "c_limit,h_1600,w_1600/cs_srgb,f_webp,q_auto:good";
export const EAGER_TRANSFORMATIONS = `${CARD_TRANSFORMATION}|${DETAIL_TRANSFORMATION}`;

const MAX_MASTER_BYTES = 8 * 1024 * 1024;
const MAX_CARD_BYTES = 512 * 1024;
const MAX_DETAIL_BYTES = 2 * 1024 * 1024;
const MAX_MASTER_EDGE = 2560;
const MAX_ASPECT_RATIO = 20;
const CALLBACK_MAX_AGE_SECONDS = 2 * 60 * 60;
const PROVIDER_REQUEST_TIMEOUT_MS = 10_000;

export type TaskImageProviderConfig = {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
  callbackUrl: string;
};

export type ProviderAssetPresence = "present" | "absent" | "unknown";

export type ProviderCleanupResult = "deleted" | "absent" | "retry";

export type TaskImageProviderUsage = {
  pooledPercentage: number;
  transformations: number;
  storageBytes: number;
  bandwidthBytes: number;
};

function nonNegativeFinite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

function usageValue(payload: Record<string, unknown>, key: string) {
  const category = payload[key];
  if (!category || typeof category !== "object") return undefined;
  return nonNegativeFinite((category as Record<string, unknown>).usage);
}

export async function fetchProviderUsage(
  provider: TaskImageProviderConfig
): Promise<TaskImageProviderUsage> {
  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(provider.cloudName)}/usage`,
      {
        headers: {
          Authorization: `Basic ${btoa(`${provider.apiKey}:${provider.apiSecret}`)}`,
        },
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      }
    );
    if (!response.ok) throw new Error("provider_usage_unavailable");
    const payload = (await response.json()) as Record<string, unknown>;
    const credits = payload.credits;
    const pooledPercentage =
      credits && typeof credits === "object"
        ? nonNegativeFinite((credits as Record<string, unknown>).used_percent)
        : undefined;
    const transformations = usageValue(payload, "transformations");
    const storageBytes = usageValue(payload, "storage");
    const bandwidthBytes = usageValue(payload, "bandwidth");
    if (
      pooledPercentage === undefined ||
      transformations === undefined ||
      storageBytes === undefined ||
      bandwidthBytes === undefined
    ) {
      throw new Error("provider_usage_unavailable");
    }
    return { pooledPercentage, transformations, storageBytes, bandwidthBytes };
  } catch {
    throw new Error("provider_usage_unavailable");
  }
}

/**
 * Checks only the expected authenticated asset identity. The response is
 * reduced to presence so provider metadata never crosses the client boundary.
 */
export async function checkProviderAssetPresence({
  provider,
  publicId,
}: {
  provider: TaskImageProviderConfig;
  publicId: string;
}): Promise<ProviderAssetPresence> {
  const endpoint =
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(provider.cloudName)}` +
    `/resources/image/authenticated?public_ids[]=${encodeURIComponent(publicId)}`;
  try {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Basic ${btoa(`${provider.apiKey}:${provider.apiSecret}`)}`,
      },
      signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) return "unknown";
    const payload = (await response.json()) as { resources?: unknown };
    return Array.isArray(payload.resources) && payload.resources.length > 0 ? "present" : "absent";
  } catch {
    return "unknown";
  }
}

async function resolveAmbiguousCleanup(provider: TaskImageProviderConfig, publicId: string) {
  const presence = await checkProviderAssetPresence({ provider, publicId });
  return presence === "absent" ? ("absent" as const) : ("retry" as const);
}

export async function deleteProviderAsset({
  provider,
  publicId,
}: {
  provider: TaskImageProviderConfig;
  publicId: string;
}): Promise<ProviderCleanupResult> {
  const timestamp = Math.floor(Date.now() / 1000);
  const parameters = {
    invalidate: "true",
    public_id: publicId,
    timestamp: String(timestamp),
    type: "authenticated",
  };
  const signature = await sha256Hex(
    `${serializeSignedParameters(parameters)}${provider.apiSecret}`
  );
  const body = new URLSearchParams({
    ...parameters,
    signature_algorithm: "sha256",
    api_key: provider.apiKey,
    signature,
  });
  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(provider.cloudName)}/image/destroy`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
      }
    );
    if (response.status === 404) return await resolveAmbiguousCleanup(provider, publicId);
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      return "retry";
    }
    if (!response.ok) return await resolveAmbiguousCleanup(provider, publicId);
    const payload = (await response.json()) as { result?: unknown };
    if (payload.result === "ok") return "deleted";
    if (payload.result === "not found") return "absent";
    return await resolveAmbiguousCleanup(provider, publicId);
  } catch {
    return await resolveAmbiguousCleanup(provider, publicId);
  }
}

type EncodingClass = "jpeg" | "png";

type ProviderVariant = {
  transformation: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
};

export type ProviderUploadResult = {
  publicId: string;
  version: number;
  signature: string;
  resourceType: string;
  deliveryType: string;
  format: string;
  width: number;
  height: number;
  bytes: number;
  eager: readonly ProviderVariant[];
};

export function buildEagerWebhookVerificationInput({
  publicId,
  version,
  master,
  eager,
}: {
  publicId: string;
  version: number;
  master: { format: "jpg" | "png"; width: number; height: number; bytes: number };
  eager: readonly ProviderVariant[];
}): ProviderUploadResult {
  return {
    publicId,
    version,
    signature: "",
    resourceType: "image",
    deliveryType: "authenticated",
    format: master.format,
    width: master.width,
    height: master.height,
    bytes: master.bytes,
    eager,
  };
}

type VerifiedMaster = {
  publicId: string;
  version: number;
  master: { format: "jpg" | "png"; width: number; height: number; bytes: number };
};

function incomingTransformation(encodingClass: EncodingClass) {
  return encodingClass === "jpeg"
    ? "c_limit,h_2560,w_2560/cs_srgb,f_jpg,q_85"
    : "c_limit,h_2560,w_2560/cs_srgb,f_png";
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function sha256Base64Url(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return bytesToBase64Url(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function serializeSignedParameters(parameters: Record<string, string>) {
  return Object.entries(parameters)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

export async function buildUploadGrant({
  provider,
  publicId,
  timestamp,
  encodingClass,
}: {
  provider: TaskImageProviderConfig;
  publicId: string;
  timestamp: number;
  encodingClass: EncodingClass;
}) {
  const signedParameters = {
    allowed_formats: "jpg,png",
    backup: "false",
    eager: EAGER_TRANSFORMATIONS,
    eager_async: "true",
    eager_notification_url: provider.callbackUrl,
    format: encodingClass === "jpeg" ? "jpg" : "png",
    notification_url: provider.callbackUrl,
    overwrite: "false",
    public_id: publicId,
    return_delete_token: "false",
    timestamp: String(timestamp),
    transformation: incomingTransformation(encodingClass),
    type: "authenticated",
    unique_filename: "false",
    use_filename: "false",
  };
  const signature = await sha256Hex(
    `${serializeSignedParameters(signedParameters)}${provider.apiSecret}`
  );
  return {
    cloudName: provider.cloudName,
    apiKey: provider.apiKey,
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(provider.cloudName)}/image/upload`,
    expiresAt: timestamp + 60 * 60,
    discardAfter: timestamp + 10 * 60,
    signatureAlgorithm: "sha256" as const,
    signature,
    signedParameters,
  };
}

function dimensionsAreValid(width: number, height: number, maxEdge: number) {
  return (
    Number.isSafeInteger(width) &&
    Number.isSafeInteger(height) &&
    width >= 32 &&
    height >= 32 &&
    width <= maxEdge &&
    height <= maxEdge &&
    Math.max(width, height) / Math.min(width, height) <= MAX_ASPECT_RATIO
  );
}

function variantIsValid(
  variant: ProviderVariant,
  transformation: string,
  maxEdge: number,
  maxBytes: number,
  master: { width: number; height: number }
) {
  return (
    variant.transformation === transformation &&
    variant.format === "webp" &&
    dimensionsAreValid(variant.width, variant.height, maxEdge) &&
    variant.width <= master.width &&
    variant.height <= master.height &&
    Number.isSafeInteger(variant.bytes) &&
    variant.bytes > 0 &&
    variant.bytes <= maxBytes
  );
}

async function verifyProviderMaster(
  response: ProviderUploadResult,
  expected: {
    apiSecret: string;
    expectedPublicId: string;
    expectedEncodingClass: EncodingClass;
  },
  verifyResponseSignature: boolean
): Promise<(VerifiedMaster & { ok: true }) | { ok: false; failureCode: "normalization_failed" | "master_too_large" }> {
  const expectedSignature = verifyResponseSignature
    ? await sha256Hex(
        `public_id=${response.publicId}&version=${response.version}${expected.apiSecret}`
      )
    : response.signature;
  const expectedFormat = expected.expectedEncodingClass === "jpeg" ? "jpg" : "png";
  if (
    !constantTimeEqual(expectedSignature, response.signature) ||
    response.publicId !== expected.expectedPublicId ||
    !Number.isSafeInteger(response.version) ||
    response.version <= 0 ||
    response.resourceType !== "image" ||
    response.deliveryType !== "authenticated" ||
    response.format !== expectedFormat ||
    !dimensionsAreValid(response.width, response.height, MAX_MASTER_EDGE)
  ) {
    return { ok: false, failureCode: "normalization_failed" };
  }
  if (!Number.isSafeInteger(response.bytes) || response.bytes <= 0 || response.bytes > MAX_MASTER_BYTES) {
    return { ok: false, failureCode: "master_too_large" };
  }

  return {
    ok: true,
    publicId: response.publicId,
    version: response.version,
    master: {
      format: expectedFormat,
      width: response.width,
      height: response.height,
      bytes: response.bytes,
    },
  };
}

async function verifyProviderResult(
  response: ProviderUploadResult,
  expected: {
    apiSecret: string;
    expectedPublicId: string;
    expectedEncodingClass: EncodingClass;
  },
  verifyResponseSignature: boolean
): Promise<
  | (VerifiedMaster & {
      ok: true;
      variants: {
        card: { format: "webp"; width: number; height: number; bytes: number };
        detail: { format: "webp"; width: number; height: number; bytes: number };
      };
    })
  | { ok: false; failureCode: "normalization_failed" | "master_too_large" | "variant_too_large" }
> {
  const verifiedMaster = await verifyProviderMaster(
    response,
    expected,
    verifyResponseSignature
  );
  if (!verifiedMaster.ok) return verifiedMaster;

  const cardCandidates = response.eager.filter(
    (variant) => variant.transformation === CARD_TRANSFORMATION
  );
  const detailCandidates = response.eager.filter(
    (variant) => variant.transformation === DETAIL_TRANSFORMATION
  );
  if (cardCandidates.length !== 1 || detailCandidates.length !== 1 || response.eager.length !== 2) {
    return { ok: false, failureCode: "normalization_failed" };
  }
  const master = { width: response.width, height: response.height };
  if (
    !variantIsValid(cardCandidates[0], CARD_TRANSFORMATION, 640, MAX_CARD_BYTES, master) ||
    !variantIsValid(detailCandidates[0], DETAIL_TRANSFORMATION, 1600, MAX_DETAIL_BYTES, master)
  ) {
    return { ok: false, failureCode: "variant_too_large" };
  }
  const card = cardCandidates[0];
  const detail = detailCandidates[0];
  return {
    ...verifiedMaster,
    variants: {
      card: { format: "webp", width: card.width, height: card.height, bytes: card.bytes },
      detail: {
        format: "webp",
        width: detail.width,
        height: detail.height,
        bytes: detail.bytes,
      },
    },
  };
}

export async function verifyProviderUploadMaster(
  response: ProviderUploadResult,
  expected: {
    apiSecret: string;
    expectedPublicId: string;
    expectedEncodingClass: EncodingClass;
  }
) {
  return verifyProviderMaster(response, expected, true);
}

export async function verifyProviderUploadResult(
  response: ProviderUploadResult,
  expected: {
    apiSecret: string;
    expectedPublicId: string;
    expectedEncodingClass: EncodingClass;
  }
) {
  return verifyProviderResult(response, expected, true);
}

export async function verifyProviderWebhookResult(
  response: ProviderUploadResult,
  expected: {
    apiSecret: string;
    expectedPublicId: string;
    expectedEncodingClass: EncodingClass;
  }
) {
  return verifyProviderResult(response, expected, false);
}

export async function verifyProviderWebhookMaster(
  response: ProviderUploadResult,
  expected: {
    apiSecret: string;
    expectedPublicId: string;
    expectedEncodingClass: EncodingClass;
  }
) {
  return verifyProviderMaster(response, expected, false);
}

export async function verifyWebhookSignature({
  rawBody,
  timestamp,
  signature,
  apiSecret,
  nowSeconds,
}: {
  rawBody: string;
  timestamp: number;
  signature: string;
  apiSecret: string;
  nowSeconds: number;
}) {
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp > nowSeconds + 60 ||
    nowSeconds - timestamp > CALLBACK_MAX_AGE_SECONDS
  ) {
    return false;
  }
  const expected = await sha256Hex(`${rawBody}${timestamp}${apiSecret}`);
  return constantTimeEqual(expected, signature);
}

export async function buildDeliveryUrl({
  cloudName,
  apiSecret,
  publicId,
  version,
  variant,
}: {
  cloudName: string;
  apiSecret: string;
  publicId: string;
  version: number;
  variant: "card" | "detail";
}) {
  const transformation = variant === "card" ? CARD_TRANSFORMATION : DETAIL_TRANSFORMATION;
  const deliveryPath = `${transformation}/v${version}/${publicId}.webp`;
  const signature = (await sha256Base64Url(`${deliveryPath}${apiSecret}`)).slice(0, 8);
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/authenticated/s--${signature}--/${deliveryPath}`;
}
