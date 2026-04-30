function readEnv() {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
}

const DEFAULT_WEB_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function readCommaSeparatedOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function getPrimarySiteUrl(): string {
  const env = readEnv();
  return env?.SITE_URL?.trim() ?? env?.VITE_SITE_URL?.trim() ?? DEFAULT_WEB_ORIGINS[0];
}

export function getAllowedWebOrigins(): string[] {
  const env = readEnv();
  const siteUrl = env?.SITE_URL?.trim() ?? env?.VITE_SITE_URL?.trim();
  const extraOrigins = readCommaSeparatedOrigins(env?.ALLOWED_CORS_ORIGINS);

  return Array.from(
    new Set([
      ...(siteUrl ? [siteUrl] : []),
      ...DEFAULT_WEB_ORIGINS,
      ...extraOrigins,
    ])
  );
}

export function getAuthTrustedOrigins(): string[] {
  const env = readEnv();
  const mobileScheme = env?.MOBILE_APP_SCHEME ?? "pravah://";

  return Array.from(new Set([...getAllowedWebOrigins(), mobileScheme]));
}
