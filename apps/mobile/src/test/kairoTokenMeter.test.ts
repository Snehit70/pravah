import { describe, expect, it } from "vitest";
import { contextWindowForModel, estimateTokens } from "../lib/kairoApi";

describe("estimateTokens", () => {
  it("returns 0 for empty input", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("grows monotonically with text length", () => {
    expect(estimateTokens("hi")).toBeLessThan(estimateTokens("hello there"));
  });

  it("approximates ~4 characters per token", () => {
    // 12 chars -> ceil(12 / 4) = 3
    expect(estimateTokens("123456789012")).toBe(3);
  });
});

describe("contextWindowForModel", () => {
  it("recognizes Claude models", () => {
    expect(contextWindowForModel("claude-opus-4-8")).toBe(200_000);
  });

  it("recognizes Gemini models", () => {
    expect(contextWindowForModel("gemini-2.0-flash")).toBe(1_000_000);
  });

  it("recognizes OpenAI models", () => {
    expect(contextWindowForModel("gpt-4o")).toBe(128_000);
  });

  it("falls back to a sane default for unknown or missing ids", () => {
    expect(contextWindowForModel("some-local-model")).toBe(128_000);
    expect(contextWindowForModel(undefined)).toBe(128_000);
    expect(contextWindowForModel(null)).toBe(128_000);
  });
});
