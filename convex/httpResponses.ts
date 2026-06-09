export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type HttpResult<T> =
  | { data: T; response: null }
  | { data?: never; response: Response };

export function validationError(issues: unknown): Response {
  return jsonResponse({ error: "Validation failed", details: issues }, 400);
}

export async function parseJsonBody(request: Request): Promise<HttpResult<unknown>> {
  try {
    return { data: await request.json(), response: null };
  } catch {
    return {
      response: jsonResponse({ error: "Request body must be valid JSON" }, 400),
    };
  }
}

export async function runWithBadRequest<T>(
  execute: () => Promise<T>,
  fallbackMessage: string
): Promise<HttpResult<T>> {
  try {
    return { data: await execute(), response: null };
  } catch (error: unknown) {
    return {
      response: jsonResponse(
        {
          error: error instanceof Error ? error.message : fallbackMessage,
        },
        400
      ),
    };
  }
}
