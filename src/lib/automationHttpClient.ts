type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type ToolArguments = Record<string, JsonValue>;

interface CallConvexApiOptions {
  convexUrl: string | undefined;
  endpoint: string;
  method: string;
  body?: ToolArguments;
  apiKey?: string;
  bearerToken?: string;
  idempotencyKey?: string;
  fetchImpl?: typeof fetch;
}

export async function callConvexApi({
  convexUrl,
  endpoint,
  method,
  body,
  apiKey,
  bearerToken,
  idempotencyKey,
  fetchImpl = fetch,
}: CallConvexApiOptions) {
  if (!convexUrl) {
    throw new Error("CONVEX_URL is not configured");
  }

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }
  if (bearerToken) {
    headers.Authorization = `Bearer ${bearerToken}`;
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const response = await fetchImpl(`${convexUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Convex API ${method} ${endpoint} failed (${response.status}): ${errorText}`
    );
  }

  return response.json();
}
