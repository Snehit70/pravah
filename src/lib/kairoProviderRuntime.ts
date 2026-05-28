import type { KairoConfig } from "./kairoConfig";

export function buildOpenAIRequestBody(
  config: KairoConfig,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  text: string
) {
  return {
    model: config.model,
    max_tokens: 1024,
    messages: [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: text }],
  };
}

export function buildAnthropicRequestBody(
  config: KairoConfig,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  text: string
) {
  return {
    model: config.model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [...history.filter((m) => m.role === "user" || m.role === "assistant"), { role: "user", content: text }],
  };
}

export function buildGeminiRequestBody(
  config: KairoConfig,
  systemPrompt: string,
  history: Array<{ role: string; content: string }>,
  text: string
) {
  return {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: history
      .map((message) => ({
        role: message.role === "assistant" ? "model" : "user",
        parts: [{ text: message.content }],
      }))
      .concat([{ role: "user", parts: [{ text }] }]),
    generationConfig: { maxOutputTokens: 1024 },
    model: config.model,
  };
}

export function buildGeminiRequestUrl(baseUrl: string, model: string, apiKey: string): string {
  const modelName = encodeURIComponent(model.trim());
  const expandedBase = baseUrl.includes("{model}") ? baseUrl.replace("{model}", modelName) : baseUrl;
  const separator = expandedBase.includes("?") ? "&" : "?";
  return `${expandedBase}${separator}key=${encodeURIComponent(apiKey.trim())}`;
}

function readAssistantText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "type" in part && "text" in part && (part as { type?: string }).type === "text") {
        return String((part as { text: unknown }).text ?? "");
      }
      return "";
    })
    .join("")
    .trim();
}

export function readKairoResponseText(data: unknown, providerFormat: KairoConfig["providerFormat"]): string {
  if (!data || typeof data !== "object") return "";
  if (providerFormat === "anthropic" && "content" in data) {
    return readAssistantText((data as { content?: unknown }).content);
  }
  if (providerFormat === "gemini") {
    const candidate = (data as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
    }).candidates?.[0];
    return (candidate?.content?.parts ?? [])
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim();
  }
  return readAssistantText((data as { choices?: Array<{ message?: { content?: unknown } }> }).choices?.[0]?.message?.content);
}
