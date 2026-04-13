import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex, crossDomain } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth";
import { query } from "./_generated/server";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";

function readEnv() {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
}

export const authComponent = createClient<DataModel>(components.betterAuth);

export function createAuth(ctx: GenericCtx<DataModel>) {
  const env = readEnv();
  const siteUrl = env?.SITE_URL ?? env?.VITE_SITE_URL ?? "http://localhost:5173";
  const googleClientId = env?.GOOGLE_OAUTH_CLIENT_ID ?? env?.VITE_GOOGLE_CLIENT_ID;
  const googleClientSecret = env?.GOOGLE_OAUTH_CLIENT_SECRET;

  return betterAuth({
    trustedOrigins: [siteUrl],
    database: authComponent.adapter(ctx),
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
              prompt: "select_account",
            },
          }
        : {},
    user: {
      additionalFields: {
        name: {
          type: "string",
          required: false,
        },
      },
    },
    plugins: [
      crossDomain({ siteUrl }),
      convex({ authConfig }),
    ],
  });
}

export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return await authComponent.getAuthUser(ctx);
  },
});
