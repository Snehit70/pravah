import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import * as SecureStore from "expo-secure-store";

function toSiteUrl(convexUrl?: string): string | undefined {
  if (!convexUrl) return undefined;
  return convexUrl.replace(".convex.cloud", ".convex.site");
}

const authBaseUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL ?? toSiteUrl(process.env.EXPO_PUBLIC_CONVEX_URL);

if (!authBaseUrl) {
  throw new Error("Missing Convex site URL. Set EXPO_PUBLIC_CONVEX_SITE_URL or EXPO_PUBLIC_CONVEX_URL.");
}

const COOKIE_STORAGE_KEY = "better-auth_cookie";
const SESSION_STORAGE_KEY = "better-auth_session_data";

const authStorageCache = new Map<string, string>();

export const authStorageReady = Promise.all([
  SecureStore.getItemAsync(COOKIE_STORAGE_KEY),
  SecureStore.getItemAsync(SESSION_STORAGE_KEY),
]).then(([cookie, sessionData]) => {
  if (cookie !== null) authStorageCache.set(COOKIE_STORAGE_KEY, cookie);
  if (sessionData !== null) authStorageCache.set(SESSION_STORAGE_KEY, sessionData);
});

const authStorage = {
  getItem: (key: string): string | null => authStorageCache.get(key) ?? null,
  setItem: (key: string, value: string): void => {
    authStorageCache.set(key, value);
    void SecureStore.setItemAsync(key, value);
  },
  removeItem: (key: string): void => {
    authStorageCache.delete(key);
    void SecureStore.deleteItemAsync(key);
  },
};

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  plugins: [
    convexClient(),
    crossDomainClient({ storage: authStorage }),
  ],
});
