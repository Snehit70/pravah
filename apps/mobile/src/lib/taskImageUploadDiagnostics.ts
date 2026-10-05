/** An opaque correlation value; never export source paths or provider request data. */
export function imageTransferTrace(uploadId: string) {
  let hash = 2166136261;
  for (let i = 0; i < uploadId.length; i++)
    hash = Math.imul(hash ^ uploadId.charCodeAt(i), 16777619);
  return `image-${(hash >>> 0).toString(16)}`;
}

export function providerFailureCategory(status: number, body: string): string {
  // Classify locally, then discard the provider's potentially sensitive text.
  if (status === 401 || status === 403) return "provider_auth";
  if (status === 429) return "provider_rate_limit";
  if (status >= 500) return "provider_unavailable";
  let message = "";
  try {
    message = String(JSON.parse(body)?.error?.message ?? "").toLowerCase();
  } catch {
    /* No body is logged. */
  }
  if (message.includes("signature")) return "provider_signature";
  if (message.includes("already exists")) return "provider_duplicate";
  if (message.includes("too large") || message.includes("file size"))
    return "provider_size";
  if (message.includes("format")) return "provider_format";
  return "provider_rejected";
}

export function transportFailureCategory(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("cancel")) return "cancelled";
  if (message.includes("timeout") || message.includes("timed out"))
    return "transport_timeout";
  return "transport_failed";
}
