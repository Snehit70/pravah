export type KairoProviderFormat = "openai" | "anthropic";

export interface KairoConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerFormat: KairoProviderFormat;
}

const STORAGE_KEYS = {
  apiKey: "pravah:kairo-api-key",
  baseUrl: "pravah:kairo-base-url",
  model: "pravah:kairo-model",
  providerFormat: "pravah:kairo-provider-format",
} as const;

export const KAIRO_CONFIG_EVENT = "pravah:kairo-config-updated";

function readStorageValue(key: string): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(key)?.trim() ?? "";
}

function writeStorageValue(key: string, value: string) {
  if (typeof window === "undefined") return;
  const trimmed = value.trim();
  if (trimmed) {
    window.localStorage.setItem(key, trimmed);
  } else {
    window.localStorage.removeItem(key);
  }
}

function dispatchConfigUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(KAIRO_CONFIG_EVENT));
}

function readProviderFormat(): KairoProviderFormat {
  const value = readStorageValue(STORAGE_KEYS.providerFormat);
  return value === "anthropic" ? "anthropic" : "openai";
}

export function getKairoConfig(): KairoConfig {
  return {
    apiKey: readStorageValue(STORAGE_KEYS.apiKey),
    baseUrl: readStorageValue(STORAGE_KEYS.baseUrl),
    model: readStorageValue(STORAGE_KEYS.model),
    providerFormat: readProviderFormat(),
  };
}

export function saveKairoConfig(config: KairoConfig) {
  writeStorageValue(STORAGE_KEYS.apiKey, config.apiKey);
  writeStorageValue(STORAGE_KEYS.baseUrl, config.baseUrl);
  writeStorageValue(STORAGE_KEYS.model, config.model);
  writeStorageValue(STORAGE_KEYS.providerFormat, config.providerFormat);
  dispatchConfigUpdated();
}

export function clearKairoConfig() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEYS.apiKey);
  window.localStorage.removeItem(STORAGE_KEYS.baseUrl);
  window.localStorage.removeItem(STORAGE_KEYS.model);
  window.localStorage.removeItem(STORAGE_KEYS.providerFormat);
  dispatchConfigUpdated();
}

export function isKairoConfigured(config: KairoConfig): boolean {
  return Boolean(config.apiKey && config.baseUrl && config.model && config.providerFormat);
}

export function getKairoProviderLabel(providerFormat: KairoProviderFormat): string {
  return providerFormat === "anthropic" ? "Anthropic" : "OpenAI";
}
