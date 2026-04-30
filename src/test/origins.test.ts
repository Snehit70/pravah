import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getAllowedWebOrigins, getAuthTrustedOrigins, getPrimarySiteUrl } from "../../convex/origins";

const env = (
  globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }
).process?.env;

describe("origin helpers", () => {
  const originalSiteUrl = env?.SITE_URL;
  const originalViteSiteUrl = env?.VITE_SITE_URL;
  const originalAllowed = env?.ALLOWED_CORS_ORIGINS;
  const originalMobileScheme = env?.MOBILE_APP_SCHEME;

  afterAll(() => {
    if (!env) return;
    env.SITE_URL = originalSiteUrl;
    env.VITE_SITE_URL = originalViteSiteUrl;
    env.ALLOWED_CORS_ORIGINS = originalAllowed;
    env.MOBILE_APP_SCHEME = originalMobileScheme;
  });

  beforeEach(() => {
    if (!env) return;
    delete env.SITE_URL;
    delete env.VITE_SITE_URL;
    delete env.ALLOWED_CORS_ORIGINS;
    delete env.MOBILE_APP_SCHEME;
  });

  it("uses SITE_URL as the primary deployed site", () => {
    if (!env) return;
    env.SITE_URL = "https://app.example.com";

    expect(getPrimarySiteUrl()).toBe("https://app.example.com");
  });

  it("includes preview origins for trusted web requests", () => {
    if (!env) return;
    env.SITE_URL = "https://app.example.com";
    env.ALLOWED_CORS_ORIGINS = "https://preview.example.com, https://staging.example.com";

    expect(getAllowedWebOrigins()).toEqual([
      "https://app.example.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://preview.example.com",
      "https://staging.example.com",
    ]);
  });

  it("adds the mobile scheme to auth trusted origins", () => {
    if (!env) return;
    env.SITE_URL = "https://app.example.com";
    env.ALLOWED_CORS_ORIGINS = "https://preview.example.com";
    env.MOBILE_APP_SCHEME = "pravah://";

    expect(getAuthTrustedOrigins()).toEqual([
      "https://app.example.com",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
      "https://preview.example.com",
      "pravah://",
    ]);
  });
});
