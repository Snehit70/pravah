import { describe, expect, it, vi } from "vitest";

// expo-secure-store pulls in react-native at import time, which the vitest
// transform can't parse. Stub it: the helper under test doesn't touch the
// keychain — it only inspects the in-memory config object.
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

import {
  KAIRO_DEFAULTS,
  hasCustomKairoEndpoint,
  validateKairoProviderProfile,
  type KairoConfig,
} from "../lib/kairoConfig";

function make(overrides: Partial<KairoConfig> = {}): KairoConfig {
  return {
    apiKey: "",
    baseUrl: "",
    model: "",
    providerFormat: "anthropic",
    ...overrides,
  };
}

describe("hasCustomKairoEndpoint", () => {
  it("treats empty fields as defaults, not customization", () => {
    // A fresh install has empty baseUrl/model but provider-default placeholders
    // are visible in the UI. Empty != custom, so the advanced section must
    // stay closed by default.
    expect(hasCustomKairoEndpoint(make())).toBe(false);
    expect(hasCustomKairoEndpoint(make({ apiKey: "sk-123" }))).toBe(false);
  });

  it("returns false when stored values exactly match provider defaults", () => {
    const config = make({
      apiKey: "sk-123",
      baseUrl: KAIRO_DEFAULTS.anthropic.baseUrl,
      model: KAIRO_DEFAULTS.anthropic.model,
    });
    expect(hasCustomKairoEndpoint(config)).toBe(false);
  });

  it("returns true when the saved endpoint URL diverges from defaults", () => {
    const config = make({
      apiKey: "sk-123",
      baseUrl: "https://proxy.internal/v1/messages",
      model: KAIRO_DEFAULTS.anthropic.model,
    });
    expect(hasCustomKairoEndpoint(config)).toBe(true);
  });

  it("returns true when the saved model diverges from defaults", () => {
    const config = make({
      apiKey: "sk-123",
      baseUrl: KAIRO_DEFAULTS.anthropic.baseUrl,
      model: "claude-opus-4-7",
    });
    expect(hasCustomKairoEndpoint(config)).toBe(true);
  });

  it("recomputes against the active provider's defaults", () => {
    const matchesOpenAi = make({
      providerFormat: "openai",
      baseUrl: KAIRO_DEFAULTS.openai.baseUrl,
      model: KAIRO_DEFAULTS.openai.model,
    });
    expect(hasCustomKairoEndpoint(matchesOpenAi)).toBe(false);

    const wrongDefaultsForProvider = make({
      providerFormat: "openai",
      baseUrl: KAIRO_DEFAULTS.anthropic.baseUrl,
      model: KAIRO_DEFAULTS.anthropic.model,
    });
    expect(hasCustomKairoEndpoint(wrongDefaultsForProvider)).toBe(true);
  });
});

describe("validateKairoProviderProfile", () => {
  it("requires every field", () => {
    expect(validateKairoProviderProfile(make())).toEqual({
      apiKey: "Enter an API key.",
      baseUrl: "Enter an endpoint URL.",
      model: "Enter a model name.",
    });
  });

  it.each(["anthropic", "openai", "gemini"] as const)(
    "accepts the default %s profile",
    (providerFormat) => {
      expect(
        validateKairoProviderProfile({
          apiKey: "provider-key",
          ...KAIRO_DEFAULTS[providerFormat],
        }),
      ).toEqual({});
    },
  );

  it("requires HTTPS for remote endpoints", () => {
    expect(
      validateKairoProviderProfile({
        apiKey: "key",
        baseUrl: "http://provider.example/v1",
        model: "model",
      }).baseUrl,
    ).toBe("Use HTTPS, or HTTP only for a local endpoint.");
  });

  it("allows HTTP for local development endpoints", () => {
    expect(
      validateKairoProviderProfile({
        apiKey: "key",
        baseUrl: "http://localhost:11434/v1/chat/completions",
        model: "model",
      }),
    ).toEqual({});
  });
});
