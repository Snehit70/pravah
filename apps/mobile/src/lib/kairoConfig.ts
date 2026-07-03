import * as SecureStore from "expo-secure-store";

export type KairoProviderFormat = "openai" | "anthropic" | "gemini";

export interface KairoProviderProfile {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface KairoSettings {
  defaultProvider: KairoProviderFormat;
  profiles: Record<KairoProviderFormat, KairoProviderProfile>;
}

export interface KairoConfig extends KairoProviderProfile {
  providerFormat: KairoProviderFormat;
}

export type KairoProfileField = keyof KairoProviderProfile;
export type KairoProfileErrors = Partial<Record<KairoProfileField, string>>;

export class KairoSettingsValidationError extends Error {
  constructor(
    public readonly provider: KairoProviderFormat,
    public readonly errors: KairoProfileErrors,
  ) {
    super(`Invalid ${getKairoProviderLabel(provider)} configuration`);
    this.name = "KairoSettingsValidationError";
  }
}

const STORAGE_KEYS = {
  settings: "pravah_kairo_settings_v2",
  // Legacy v1 keys
  apiKey: "pravah_kairo_api_key",
  baseUrl: "pravah_kairo_base_url",
  model: "pravah_kairo_model",
  providerFormat: "pravah_kairo_provider_format",
} as const;

export const KAIRO_DEFAULTS: Record<KairoProviderFormat, { baseUrl: string; model: string }> = {
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
} as const;

function makeEmptyProfile(provider: KairoProviderFormat): KairoProviderProfile {
  return {
    apiKey: "",
    baseUrl: KAIRO_DEFAULTS[provider].baseUrl,
    model: KAIRO_DEFAULTS[provider].model,
  };
}

function makeDefaultSettings(defaultProvider: KairoProviderFormat = "anthropic"): KairoSettings {
  return {
    defaultProvider,
    profiles: {
      anthropic: makeEmptyProfile("anthropic"),
      openai: makeEmptyProfile("openai"),
      gemini: makeEmptyProfile("gemini"),
    },
  };
}

function normalizeProvider(raw: string): KairoProviderFormat {
  if (raw === "openai" || raw === "anthropic" || raw === "gemini") return raw;
  return "anthropic";
}

async function readValue(key: string): Promise<string> {
  try {
    const v = await SecureStore.getItemAsync(key);
    return (v ?? "").trim();
  } catch {
    return "";
  }
}

async function migrateLegacySettingsIfNeeded(): Promise<KairoSettings | null> {
  const [apiKey, baseUrl, model, providerRaw] = await Promise.all([
    readValue(STORAGE_KEYS.apiKey),
    readValue(STORAGE_KEYS.baseUrl),
    readValue(STORAGE_KEYS.model),
    readValue(STORAGE_KEYS.providerFormat),
  ]);

  if (!apiKey && !baseUrl && !model && !providerRaw) return null;

  const provider = normalizeProvider(providerRaw);
  const migrated = makeDefaultSettings(provider);
  migrated.profiles[provider] = {
    apiKey,
    baseUrl: baseUrl || KAIRO_DEFAULTS[provider].baseUrl,
    model: model || KAIRO_DEFAULTS[provider].model,
  };
  await SecureStore.setItemAsync(STORAGE_KEYS.settings, JSON.stringify(migrated));
  return migrated;
}

export async function getKairoSettings(): Promise<KairoSettings> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEYS.settings);
    if (!raw) {
      const migrated = await migrateLegacySettingsIfNeeded();
      return migrated ?? makeDefaultSettings("anthropic");
    }
    const parsed = JSON.parse(raw) as Partial<KairoSettings>;
    const provider = normalizeProvider(String(parsed.defaultProvider ?? "anthropic"));
    const out = makeDefaultSettings(provider);
    for (const p of ["anthropic", "openai", "gemini"] as KairoProviderFormat[]) {
      const profile = parsed.profiles?.[p];
      if (profile && typeof profile === "object") {
        out.profiles[p] = {
          apiKey: typeof profile.apiKey === "string" ? profile.apiKey.trim() : "",
          baseUrl:
            typeof profile.baseUrl === "string" && profile.baseUrl.trim()
              ? profile.baseUrl.trim()
              : KAIRO_DEFAULTS[p].baseUrl,
          model:
            typeof profile.model === "string" && profile.model.trim()
              ? profile.model.trim()
              : KAIRO_DEFAULTS[p].model,
        };
      }
    }
    return out;
  } catch {
    const migrated = await migrateLegacySettingsIfNeeded();
    return migrated ?? makeDefaultSettings("anthropic");
  }
}

export async function saveKairoSettings(settings: KairoSettings): Promise<void> {
  const provider = normalizeProvider(settings.defaultProvider);
  const normalized: KairoSettings = makeDefaultSettings(provider);
  for (const p of ["anthropic", "openai", "gemini"] as KairoProviderFormat[]) {
    const profile = {
      apiKey: settings.profiles[p]?.apiKey?.trim?.() ?? "",
      baseUrl: settings.profiles[p]?.baseUrl?.trim?.() || KAIRO_DEFAULTS[p].baseUrl,
      model: settings.profiles[p]?.model?.trim?.() || KAIRO_DEFAULTS[p].model,
    };
    if (profile.apiKey) {
      const errors = validateKairoProviderProfile(profile);
      if (Object.keys(errors).length > 0) {
        throw new KairoSettingsValidationError(p, errors);
      }
    }
    normalized.profiles[p] = profile;
  }
  await SecureStore.setItemAsync(STORAGE_KEYS.settings, JSON.stringify(normalized));
}

export async function getKairoConfig(): Promise<KairoConfig> {
  const settings = await getKairoSettings();
  const providerFormat = settings.defaultProvider;
  const profile = settings.profiles[providerFormat];
  return {
    providerFormat,
    apiKey: profile.apiKey,
    baseUrl: profile.baseUrl,
    model: profile.model,
  };
}

export async function saveKairoConfig(config: KairoConfig): Promise<void> {
  const settings = await getKairoSettings();
  settings.defaultProvider = normalizeProvider(config.providerFormat);
  settings.profiles[settings.defaultProvider] = {
    apiKey: config.apiKey.trim(),
    baseUrl: config.baseUrl.trim() || KAIRO_DEFAULTS[settings.defaultProvider].baseUrl,
    model: config.model.trim() || KAIRO_DEFAULTS[settings.defaultProvider].model,
  };
  await saveKairoSettings(settings);
}

export async function clearKairoConfig(): Promise<void> {
  await Promise.all(
    Object.values(STORAGE_KEYS).map((k) => SecureStore.deleteItemAsync(k))
  );
}

export function isKairoConfigured(c: KairoConfig): boolean {
  return (
    Boolean(c.apiKey && c.providerFormat) &&
    Object.keys(validateKairoProviderProfile(c)).length === 0
  );
}

export function getKairoProviderLabel(p: KairoProviderFormat): string {
  if (p === "anthropic") return "Anthropic";
  if (p === "gemini") return "Gemini";
  return "OpenAI";
}

export function validateKairoProviderProfile(
  profile: KairoProviderProfile,
): KairoProfileErrors {
  const errors: KairoProfileErrors = {};
  const apiKey = profile.apiKey.trim();
  const baseUrl = profile.baseUrl.trim();
  const model = profile.model.trim();

  if (!apiKey) {
    errors.apiKey = "Enter an API key.";
  }

  if (!baseUrl) {
    errors.baseUrl = "Enter an endpoint URL.";
  } else {
    try {
      const parsed = new URL(baseUrl);
      const localHttp =
        parsed.protocol === "http:" &&
        (parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1" ||
          parsed.hostname === "::1");
      if (parsed.protocol !== "https:" && !localHttp) {
        errors.baseUrl = "Use HTTPS, or HTTP only for a local endpoint.";
      }
    } catch {
      errors.baseUrl = "Enter a valid endpoint URL.";
    }
  }

  if (!model) {
    errors.model = "Enter a model name.";
  } else if ([...model].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 31 || code === 127;
  })) {
    errors.model = "Model name contains unsupported characters.";
  }

  return errors;
}

export function hasCustomKairoEndpoint(c: KairoConfig): boolean {
  const defaults = KAIRO_DEFAULTS[c.providerFormat];
  const customUrl = Boolean(c.baseUrl) && c.baseUrl !== defaults.baseUrl;
  const customModel = Boolean(c.model) && c.model !== defaults.model;
  return customUrl || customModel;
}
