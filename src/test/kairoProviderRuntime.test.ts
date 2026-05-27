import { describe, expect, it } from "vitest";
import {
  buildGeminiRequestBody,
  buildGeminiRequestUrl,
  readKairoResponseText,
} from "../lib/kairoProviderRuntime";

describe("kairoProviderRuntime", () => {
  it("builds Gemini request URL with model replacement and api key", () => {
    const url = buildGeminiRequestUrl(
      "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
      "gemini-2.5-flash",
      "abc123"
    );
    expect(url).toContain("models/gemini-2.5-flash:generateContent");
    expect(url).toContain("key=abc123");
  });

  it("builds Gemini request body with system instruction and mapped history", () => {
    const body = buildGeminiRequestBody(
      {
        providerFormat: "gemini",
        apiKey: "k",
        baseUrl: "https://example.com",
        model: "gemini-2.5-flash",
      },
      "system prompt",
      [{ role: "assistant", content: "hello" }],
      "next"
    );

    expect(body.system_instruction.parts[0].text).toBe("system prompt");
    expect(body.contents[0].role).toBe("model");
    expect(body.contents[1].parts[0].text).toBe("next");
  });

  it("reads Gemini response text from candidates.parts", () => {
    const text = readKairoResponseText(
      {
        candidates: [{ content: { parts: [{ text: "Plan this week" }] } }],
      },
      "gemini"
    );
    expect(text).toBe("Plan this week");
  });
});
