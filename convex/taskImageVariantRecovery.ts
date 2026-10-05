/** Reads WebP headers from a bounded trusted provider download. */
export function webpDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const text = (offset: number, size: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + size));
  if (bytes.length < 30 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP")
    return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = text(12, 4);
  if (chunk === "VP8X") {
    if (bytes[20] & 2) return null; // Animation is not a fixed Task variant.
    const u24 = (offset: number) =>
      bytes[offset] + (bytes[offset + 1] << 8) + (bytes[offset + 2] << 16);
    return { width: u24(24) + 1, height: u24(27) + 1 };
  }
  if (chunk === "VP8 " && text(23, 3) === "\x9d\x01\x2a") {
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const bits = view.getUint32(21, true);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  return null;
}

export async function readRecoveryVariant(url: string, maxBytes: number) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
  });
  if (!response.ok || !response.body) return null;
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body.cancel();
    return null;
  }
  const reader = response.body.getReader();
  let total = 0;
  const header = new Uint8Array(64);
  let headerLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maxBytes) return null;
      const count = Math.min(header.length - headerLength, value.length);
      header.set(value.subarray(0, count), headerLength);
      headerLength += count;
    }
    const dimensions = webpDimensions(header.subarray(0, headerLength));
    return dimensions
      ? { ...dimensions, bytes: total, format: "webp" as const }
      : null;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
