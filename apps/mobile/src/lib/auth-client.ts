import {
  convexClient,
  crossDomainClient,
} from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const authBaseUrl = process.env.EXPO_PUBLIC_CONVEX_SITE_URL;

if (!authBaseUrl) {
  throw new Error("Missing EXPO_PUBLIC_CONVEX_SITE_URL in mobile environment");
}

export const authClient = createAuthClient({
  baseURL: authBaseUrl,
  plugins: [
    convexClient(),
    crossDomainClient(),
  ],
});
