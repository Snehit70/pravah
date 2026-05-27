export type KairoProviderFormat = "openai" | "anthropic" | "gemini";

export interface KairoConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerFormat: KairoProviderFormat;
}

interface KairoProviderProfile {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface KairoSettings {
  defaultProvider: KairoProviderFormat;
  profiles: Record<KairoProviderFormat, KairoProviderProfile>;
}

const STORAGE_KEYS = {
  apiKey: "pravah:kairo-api-key",
  baseUrl: "pravah:kairo-base-url",
  model: "pravah:kairo-model",
  providerFormat: "pravah:kairo-provider-format",
  settings: "pravah:kairo-settings-v2",
} as const;

export const KAIRO_CONFIG_EVENT = "pravah:kairo-config-updated";

export const KAIRO_DEFAULTS: Record<KairoProviderFormat, Pick<KairoProviderProfile, "baseUrl" | "model">> = {
  anthropic: {
    baseUrl: "https://api.anthropic.com/v1/messages",
    model: "claude-haiku-4-5",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-5.4-mini",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
    model: "gemini-2.5-flash",
  },
};

function emptyProfile(provider: KairoProviderFormat): KairoProviderProfile {
  return {
    apiKey: "",
    baseUrl: KAIRO_DEFAULTS[provider].baseUrl,
    model: KAIRO_DEFAULTS[provider].model,
  };
}

function defaultSettings(): KairoSettings {
  return {
    defaultProvider: "openai",
    profiles: {
      openai: emptyProfile("openai"),
      anthropic: emptyProfile("anthropic"),
      gemini: emptyProfile("gemini"),
    },
  };
}

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

function normalizeProviderFormat(value: string): KairoProviderFormat {
  if (value === "anthropic" || value === "gemini") return value;
  return "openai";
}

function sanitizeSettings(input: unknown): KairoSettings {
  const base = defaultSettings();
  if (!input || typeof input !== "object") return base;

  const root = input as Record<string, unknown>;
  const defaultProvider = normalizeProviderFormat(String(root.defaultProvider ?? base.defaultProvider));
  const profilesRaw = root.profiles as Record<string, unknown> | undefined;
  const profiles = { ...base.profiles };

  (["openai", "anthropic", "gemini"] as const).forEach((provider) => {
    const raw = profilesRaw?.[provider];
    if (!raw || typeof raw !== "object") return;
    const profile = raw as Record<string, unknown>;
    profiles[provider] = {
      apiKey: String(profile.apiKey ?? "").trim(),
      baseUrl: String(profile.baseUrl ?? "").trim() || KAIRO_DEFAULTS[provider].baseUrl,
      model: String(profile.model ?? "").trim() || KAIRO_DEFAULTS[provider].model,
    };
  });

  return {
    defaultProvider,
    profiles,
  };
}

function migrateLegacySettings(): KairoSettings {
  const provider = normalizeProviderFormat(readStorageValue(STORAGE_KEYS.providerFormat));
  const settings = defaultSettings();
  settings.defaultProvider = provider;
  settings.profiles[provider] = {
    apiKey: readStorageValue(STORAGE_KEYS.apiKey),
    baseUrl: readStorageValue(STORAGE_KEYS.baseUrl) || KAIRO_DEFAULTS[provider].baseUrl,
    model: readStorageValue(STORAGE_KEYS.model) || KAIRO_DEFAULTS[provider].model,
  };
  return settings;
}

function writeSettings(settings: KairoSettings) {
  writeStorageValue(STORAGE_KEYS.settings, JSON.stringify(settings));
}

function writeLegacyMirror(settings: KairoSettings) {
  const active = settings.profiles[settings.defaultProvider];
  writeStorageValue(STORAGE_KEYS.providerFormat, settings.defaultProvider);
  writeStorageValue(STORAGE_KEYS.apiKey, active.apiKey);
  writeStorageValue(STORAGE_KEYS.baseUrl, active.baseUrl);
  writeStorageValue(STORAGE_KEYS.model, active.model);
}

export function getKairoSettings(): KairoSettings {
  const raw = readStorageValue(STORAGE_KEYS.settings);
  if (raw) {
    try {
      return sanitizeSettings(JSON.parse(raw));
    } catch {
      return defaultSettings();
    }
  }

  const migrated = migrateLegacySettings();
  writeSettings(migrated);
  writeLegacyMirror(migrated);
  return migrated;
}

export function saveKairoSettings(settings: KairoSettings) {
  const next = sanitizeSettings(settings);
  writeSettings(next);
  writeLegacyMirror(next);
  dispatchConfigUpdated();
}

export function getKairoConfig(): KairoConfig {
  const settings = getKairoSettings();
  const active = settings.profiles[settings.defaultProvider];
  return {
    apiKey: active.apiKey,
    baseUrl: active.baseUrl,
    model: active.model,
    providerFormat: settings.defaultProvider,
  };
}

export function saveKairoConfig(config: KairoConfig) {
  const current = getKairoSettings();
  const next: KairoSettings = {
    ...current,
    defaultProvider: config.providerFormat,
    profiles: {
      ...current.profiles,
      [config.providerFormat]: {
        apiKey: config.apiKey.trim(),
        baseUrl: config.baseUrl.trim() || KAIRO_DEFAULTS[config.providerFormat].baseUrl,
        model: config.model.trim() || KAIRO_DEFAULTS[config.providerFormat].model,
      },
    },
  };
  saveKairoSettings(next);
}

export function clearKairoConfig() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEYS.apiKey);
  window.localStorage.removeItem(STORAGE_KEYS.baseUrl);
  window.localStorage.removeItem(STORAGE_KEYS.model);
  window.localStorage.removeItem(STORAGE_KEYS.providerFormat);
  window.localStorage.removeItem(STORAGE_KEYS.settings);
  dispatchConfigUpdated();
}

export function isKairoConfigured(config: KairoConfig): boolean {
  return Boolean(config.apiKey && config.baseUrl && config.model && config.providerFormat);
}

export function getKairoProviderLabel(providerFormat: KairoProviderFormat): string {
  if (providerFormat === "anthropic") return "Anthropic";
  if (providerFormat === "gemini") return "Google Gemini";
  return "OpenAI";
}
