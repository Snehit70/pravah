import * as Clipboard from "expo-clipboard";
import { File, FileMode, Paths, UploadType } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { SaveFormat, manipulateAsync } from "expo-image-manipulator";
import type {
  AcquiredTaskImageSource,
  AllowlistedProviderResult,
  NormalizedTaskImage,
  TaskImageSourceKind,
  TaskImageUploadGrant,
} from "./taskImageCoordinator";

const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 25_000_000;
const MAX_CLIPBOARD_BYTES = 6 * 1024 * 1024;
const MAX_CLIPBOARD_PIXELS = 16_000_000;
const MAX_STAGED_BYTES = 8 * 1024 * 1024;
const MAX_EDGE = 2560;
const MIN_EDGE = 32;
const MAX_ASPECT_RATIO = 20;
const MIN_FREE_STORAGE = 64 * 1024 * 1024;
const HEADER_READ_BYTES = 64 * 1024;

type HeaderInspection = {
  format: "jpeg" | "png" | "webp" | "heic";
  width?: number;
  height?: number;
  hasAlpha: boolean;
  lossless: boolean;
  animated: boolean;
};

function fail(code: string, retryable = false): never {
  throw Object.assign(new Error(code), { code, retryable });
}

function readU32BE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset] * 0x1000000 +
    (bytes[offset + 1] << 16) +
    (bytes[offset + 2] << 8) +
    bytes[offset + 3]
  );
}

function readU24LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

export function inspectTaskImageHeader(bytes: Uint8Array): HeaderInspection {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a
  ) {
    return {
      format: "png",
      width: readU32BE(bytes, 16),
      height: readU32BE(bytes, 20),
      hasAlpha: bytes[25] === 4 || bytes[25] === 6,
      lossless: true,
      animated: ascii(bytes, 0, bytes.length).includes("acTL"),
    };
  }

  if (bytes.length >= 12 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) {
        return {
          format: "jpeg",
          width: (bytes[offset + 7] << 8) | bytes[offset + 8],
          height: (bytes[offset + 5] << 8) | bytes[offset + 6],
          hasAlpha: false,
          lossless: false,
          animated: false,
        };
      }
      const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
      if (length < 2) break;
      offset += 2 + length;
    }
    fail("unsupported_format");
  }

  if (bytes.length >= 30 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    const chunk = ascii(bytes, 12, 4);
    if (chunk === "VP8X") {
      const flags = bytes[20];
      return {
        format: "webp",
        width: readU24LE(bytes, 24) + 1,
        height: readU24LE(bytes, 27) + 1,
        hasAlpha: Boolean(flags & 0x10),
        lossless: Boolean(flags & 0x10),
        animated: Boolean(flags & 0x02),
      };
    }
    if (chunk === "VP8L" && bytes.length >= 25) {
      const bits = readU32BE(new Uint8Array([bytes[24], bytes[23], bytes[22], bytes[21]]), 0);
      return {
        format: "webp",
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
        hasAlpha: true,
        lossless: true,
        animated: false,
      };
    }
    return { format: "webp", hasAlpha: false, lossless: false, animated: false };
  }

  if (bytes.length >= 16 && ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["heic", "heix", "mif1", "heif"].includes(brand)) {
      return {
        format: "heic",
        hasAlpha: false,
        lossless: false,
        animated: false,
      };
    }
  }

  fail("unsupported_format");
}

function validateDimensions(width: number, height: number, maxPixels: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < MIN_EDGE || height < MIN_EDGE) {
    fail("dimensions_too_large");
  }
  if (width * height > maxPixels) fail("dimensions_too_large");
  if (Math.max(width, height) / Math.min(width, height) > MAX_ASPECT_RATIO) {
    fail("aspect_ratio_unsupported");
  }
}

function readHeader(file: File) {
  const handle = file.open(FileMode.ReadOnly);
  try {
    return handle.readBytes(Math.min(HEADER_READ_BYTES, handle.size ?? HEADER_READ_BYTES));
  } finally {
    handle.close();
  }
}

function selectedAssetToSource(
  kind: "photos" | "camera",
  result: ImagePicker.ImagePickerResult
): AcquiredTaskImageSource {
  if (result.canceled || !result.assets[0]) fail("source_unavailable");
  const asset = result.assets[0];
  if (asset.type && asset.type !== "image") fail("unsupported_format");
  return {
    kind,
    uri: asset.uri,
    previewUri: asset.uri,
    width: asset.width,
    height: asset.height,
  } as AcquiredTaskImageSource;
}

export async function acquireTaskImageSource(
  kind: TaskImageSourceKind
): Promise<AcquiredTaskImageSource> {
  if (kind === "paste") {
    const image = await Clipboard.getImageAsync({ format: "png" });
    if (!image) fail("source_unavailable");
    validateDimensions(image.size.width, image.size.height, MAX_CLIPBOARD_PIXELS);
    const comma = image.data.indexOf(",");
    if (comma < 0) fail("unsupported_format");
    const encoded = image.data.slice(comma + 1);
    const estimatedBytes = Math.floor((encoded.length * 3) / 4);
    if (estimatedBytes > MAX_CLIPBOARD_BYTES) fail("clipboard_too_large");
    const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
    if (bytes.byteLength > MAX_CLIPBOARD_BYTES) fail("clipboard_too_large");
    const file = new File(Paths.cache, `task-image-source-${crypto.randomUUID()}.png`);
    file.create();
    file.write(bytes);
    return {
      kind,
      uri: file.uri,
      previewUri: file.uri,
      width: image.size.width,
      height: image.size.height,
    } as AcquiredTaskImageSource;
  }

  if (kind === "camera") {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) fail("source_unavailable");
    return selectedAssetToSource(
      kind,
      await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
        exif: false,
        base64: false,
      })
    );
  }

  return selectedAssetToSource(
    kind,
    await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: false,
      allowsEditing: false,
      quality: 1,
      exif: false,
      base64: false,
    })
  );
}

let normalizationQueue = Promise.resolve();

async function normalizeTaskImageNow(
  source: AcquiredTaskImageSource
): Promise<NormalizedTaskImage> {
  if (Paths.availableDiskSpace < MIN_FREE_STORAGE) fail("storage_unavailable", true);
  const sourceFile = new File(source.uri);
  if (!sourceFile.exists) fail("source_unavailable");
  if (sourceFile.size <= 0 || sourceFile.size > MAX_SOURCE_BYTES) {
    fail(source.kind === "paste" ? "clipboard_too_large" : "source_too_large");
  }

  const header = inspectTaskImageHeader(readHeader(sourceFile));
  if (header.animated) fail("animated_image");
  if (header.width && header.height) {
    validateDimensions(
      header.width,
      header.height,
      source.kind === "paste" ? MAX_CLIPBOARD_PIXELS : MAX_SOURCE_PIXELS
    );
  }
  const sourceWidth = header.width ?? (source as AcquiredTaskImageSource & { width?: number }).width;
  const sourceHeight = header.height ?? (source as AcquiredTaskImageSource & { height?: number }).height;
  if (!sourceWidth || !sourceHeight) fail("normalization_failed", true);
  validateDimensions(
    sourceWidth,
    sourceHeight,
    source.kind === "paste" ? MAX_CLIPBOARD_PIXELS : MAX_SOURCE_PIXELS
  );

  const scale = Math.min(1, MAX_EDGE / Math.max(sourceWidth, sourceHeight));
  let targetWidth = Math.max(MIN_EDGE, Math.round(sourceWidth * scale));
  let targetHeight = Math.max(MIN_EDGE, Math.round(sourceHeight * scale));
  const encodingClass =
    source.kind === "paste" || header.format === "png" || header.lossless || header.hasAlpha
      ? "png"
      : "jpeg";
  const qualitySteps = encodingClass === "jpeg" ? [0.92, 0.9, 0.85] : [1];
  const pngEdges = encodingClass === "png" ? [MAX_EDGE, 2048, 1600, 1280] : [MAX_EDGE];

  let latest: Awaited<ReturnType<typeof manipulateAsync>> | null = null;
  for (const edge of pngEdges) {
    const edgeScale = Math.min(1, edge / Math.max(targetWidth, targetHeight));
    const width = Math.max(MIN_EDGE, Math.round(targetWidth * edgeScale));
    const height = Math.max(MIN_EDGE, Math.round(targetHeight * edgeScale));
    for (const quality of qualitySteps) {
      latest = await manipulateAsync(
        source.uri,
        [{ resize: { width, height } }],
        {
          compress: quality,
          format: encodingClass === "jpeg" ? SaveFormat.JPEG : SaveFormat.PNG,
          base64: false,
        }
      );
      const output = new File(latest.uri);
      if (output.exists && output.size > 0 && output.size <= MAX_STAGED_BYTES) {
        validateDimensions(latest.width, latest.height, MAX_SOURCE_PIXELS);
        return {
          uri: latest.uri,
          previewUri: latest.uri,
          encodingClass,
          width: latest.width,
          height: latest.height,
          bytes: output.size,
        };
      }
    }
    targetWidth = width;
    targetHeight = height;
  }
  if (latest) fail("master_too_large");
  fail("normalization_failed", true);
}

export function normalizeTaskImage(source: AcquiredTaskImageSource) {
  const work = normalizationQueue.then(() => normalizeTaskImageNow(source));
  normalizationQueue = work.then(
    () => undefined,
    () => undefined
  );
  return work;
}

export async function uploadPreparedTaskImage(
  uri: string,
  grant: TaskImageUploadGrant
): Promise<AllowlistedProviderResult> {
  const file = new File(uri);
  if (!file.exists) fail("source_unavailable");
  const format = uri.toLowerCase().endsWith(".png") ? "png" : "jpg";
  const response = await file.upload(grant.uploadUrl, {
    httpMethod: "POST",
    uploadType: UploadType.MULTIPART,
    fieldName: "file",
    mimeType: format === "png" ? "image/png" : "image/jpeg",
    parameters: {
      ...grant.signedParameters,
      api_key: grant.apiKey,
      signature: grant.signature,
    },
    sessionType: "foreground",
  });
  if (response.status < 200 || response.status >= 300) fail("normalization_failed", true);
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(response.body) as Record<string, unknown>;
  } catch {
    fail("normalization_failed", true);
  }
  const eager = Array.isArray(payload.eager)
    ? payload.eager.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const entry = item as Record<string, unknown>;
        if (
          typeof entry.transformation !== "string" ||
          typeof entry.format !== "string" ||
          typeof entry.width !== "number" ||
          typeof entry.height !== "number" ||
          typeof entry.bytes !== "number"
        ) return [];
        return [{
          transformation: entry.transformation,
          format: entry.format,
          width: entry.width,
          height: entry.height,
          bytes: entry.bytes,
        }];
      })
    : [];
  return {
    publicId: typeof payload.public_id === "string" ? payload.public_id : "",
    version: typeof payload.version === "number" ? payload.version : 0,
    signature: typeof payload.signature === "string" ? payload.signature : "",
    resourceType: typeof payload.resource_type === "string" ? payload.resource_type : "",
    deliveryType: typeof payload.type === "string" ? payload.type : "",
    format: typeof payload.format === "string" ? payload.format : "",
    width: typeof payload.width === "number" ? payload.width : 0,
    height: typeof payload.height === "number" ? payload.height : 0,
    bytes: typeof payload.bytes === "number" ? payload.bytes : 0,
    eager,
  };
}
