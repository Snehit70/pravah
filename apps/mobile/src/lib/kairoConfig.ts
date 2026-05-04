import * as SecureStore from "expo-secure-store";

/**
 * Mobile mirror of src/lib/kairoConfig.ts. The web version stores Kairo
 * provider settings in localStorage (non-sensitive: just an API key the user
 * pasted in themselves, never anything we issued). On mobile we use
 * expo-secure-store so the key sits in the platform keychain rather than a
 * world-readable JSON blob.
 *
 * Storage is async on mobile, so the API surface returns Promises rather
 * than the synchronous getters the web file exposes. Callers gate their UI
 * on the resolved config in a useEffect.
 */

export type KairoProviderFormat = "openai" | "anthropic";

export interface KairoConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerFormat: KairoProviderFormat;
}

const STORAGE_KEYS = {
  apiKey: "pravah_kairo_api_key",
  baseUrl: "pravah_kairo_base_url",
  model: "pravah_kairo_model",
  providerFormat: "pravah_kairo_provider_format",
} as const;

async function readValue(key: string): Promise<string> {
  try {
    const v = await SecureStore.getItemAsync(key);
    return (v ?? "").trim();
  } catch {
    return "";
  }
}

async function writeValue(key: string, value: string): Promise<void> {
  const trimmed = value.trim();
  try {
    if (trimmed) {
      await SecureStore.setItemAsync(key, trimmed);
    } else {
      await SecureStore.deleteItemAsync(key);
    }
  } catch {
    // Keychain unavailable (e.g. on web fallback). Silently ignore — caller
    // already validates `isKairoConfigured` before sending.
  }
}

export async function getKairoConfig(): Promise<KairoConfig> {
  const [apiKey, baseUrl, model, providerFormat] = await Promise.all([
    readValue(STORAGE_KEYS.apiKey),
    readValue(STORAGE_KEYS.baseUrl),
    readValue(STORAGE_KEYS.model),
    readValue(STORAGE_KEYS.providerFormat),
  ]);
  return {
    apiKey,
    baseUrl,
    model,
    providerFormat: providerFormat === "openai" ? "openai" : "anthropic",
  };
}

export async function saveKairoConfig(config: KairoConfig): Promise<void> {
  await Promise.all([
    writeValue(STORAGE_KEYS.apiKey, config.apiKey),
    writeValue(STORAGE_KEYS.baseUrl, config.baseUrl),
    writeValue(STORAGE_KEYS.model, config.model),
    writeValue(STORAGE_KEYS.providerFormat, config.providerFormat),
  ]);
}

export async function clearKairoConfig(): Promise<void> {
  await Promise.all(
    Object.values(STORAGE_KEYS).map((k) =>
      SecureStore.deleteItemAsync(k).catch(() => undefined)
    )
  );
}

export function isKairoConfigured(c: KairoConfig): boolean {
  return Boolean(c.apiKey && c.baseUrl && c.model && c.providerFormat);
}

export function getKairoProviderLabel(p: KairoProviderFormat): string {
  return p === "anthropic" ? "Anthropic" : "OpenAI";
}

/**
 * True when the user has saved an endpoint URL or model that diverges from
 * the provider defaults. Empty fields are treated as "use defaults" and do
 * not count as customization, so a fresh install does not auto-open the
 * advanced section.
 */
export function hasCustomKairoEndpoint(c: KairoConfig): boolean {
  const defaults = KAIRO_DEFAULTS[c.providerFormat];
  const customUrl = Boolean(c.baseUrl) && c.baseUrl !== defaults.baseUrl;
  const customModel = Boolean(c.model) && c.model !== defaults.model;
  return customUrl || customModel;
}

/** Sensible defaults shown as placeholders in the Settings inputs so the
 *  user can paste the typical values without remembering them. */
export const KAIRO_DEFAULTS = {
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1/messages",
    model: "claude-sonnet-4-6",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini",
  },
} as const;
