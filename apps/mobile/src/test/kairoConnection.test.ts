import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
}));

import { KAIRO_DEFAULTS, type KairoConfig, type KairoProviderFormat } from "../lib/kairoConfig";
import { testKairoConnection } from "../lib/kairoConnection";

function config(providerFormat: KairoProviderFormat): KairoConfig {
  return {
    providerFormat,
    apiKey: "secret-key",
    ...KAIRO_DEFAULTS[providerFormat],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("testKairoConnection", () => {
  it.each([
    ["anthropic", "x-api-key", "secret-key"],
    ["openai", "Authorization", "Bearer secret-key"],
  ] as const)("uses %s authentication", async (provider, header, value) => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    await testKairoConnection(config(provider));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(init).toBeDefined();
    expect(url).toBe(KAIRO_DEFAULTS[provider].baseUrl);
    expect((init!.headers as Record<string, string>)[header]).toBe(value);
    expect(JSON.parse(init!.body as string).model).toBe(KAIRO_DEFAULTS[provider].model);
  });

  it("expands the Gemini model and sends its key in the URL", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    await testKairoConnection(config("gemini"));

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/models/gemini-2.5-flash:generateContent");
    expect(String(url)).toContain("key=secret-key");
    expect(JSON.parse(init!.body as string).contents).toBeDefined();
  });

  it("surfaces the provider error message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Invalid API key" } }),
      })) as unknown as typeof fetch,
    );

    await expect(testKairoConnection(config("anthropic"))).rejects.toThrow("Invalid API key");
  });
});
