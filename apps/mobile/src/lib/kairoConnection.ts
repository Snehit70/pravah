import {
  type KairoConfig,
  KairoSettingsValidationError,
  validateKairoProviderProfile,
} from "./kairoConfig";

const CONNECTION_TIMEOUT_MS = 15_000;

function buildGeminiUrl(baseUrl: string, model: string, apiKey: string): string {
  const expanded = baseUrl.includes("{model}")
    ? baseUrl.replace("{model}", encodeURIComponent(model))
    : baseUrl;
  const separator = expanded.includes("?") ? "&" : "?";
  return `${expanded}${separator}key=${encodeURIComponent(apiKey)}`;
}

function requestFor(config: KairoConfig): {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
} {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (config.providerFormat === "anthropic") {
    headers["x-api-key"] = config.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    return {
      url: config.baseUrl,
      headers,
      body: {
        model: config.model,
        max_tokens: 1,
        messages: [{ role: "user", content: "Reply with OK." }],
      },
    };
  }

  if (config.providerFormat === "openai") {
    headers.Authorization = `Bearer ${config.apiKey}`;
    return {
      url: config.baseUrl,
      headers,
      body: {
        model: config.model,
        max_completion_tokens: 1,
        messages: [{ role: "user", content: "Reply with OK." }],
      },
    };
  }

  return {
    url: buildGeminiUrl(config.baseUrl, config.model, config.apiKey),
    headers,
    body: {
      contents: [{ role: "user", parts: [{ text: "Reply with OK." }] }],
      generationConfig: { maxOutputTokens: 1 },
    },
  };
}

async function responseError(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: { message?: unknown }; message?: unknown }
    | null;
  const message = payload?.error?.message ?? payload?.message;
  if (typeof message === "string" && message.trim()) return message.trim();
  return `Provider returned HTTP ${response.status}.`;
}

export async function testKairoConnection(config: KairoConfig): Promise<void> {
  const normalized: KairoConfig = {
    providerFormat: config.providerFormat,
    apiKey: config.apiKey.trim(),
    baseUrl: config.baseUrl.trim(),
    model: config.model.trim(),
  };
  const errors = validateKairoProviderProfile(normalized);
  if (Object.keys(errors).length > 0) {
    throw new KairoSettingsValidationError(config.providerFormat, errors);
  }

  const request = requestFor(normalized);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS);

  try {
    const response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(await responseError(response));
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Connection timed out. Check the endpoint and try again.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
