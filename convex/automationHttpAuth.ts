import { api } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { requireApiKeyAuth } from "./httpContracts";
import { jsonResponse } from "./httpResponses";

type AutomationScope =
  | "tasks:read"
  | "tasks:write"
  | "review:read"
  | "review:write"
  | "sync:read"
  | "sync:run"
  | "agent:read";

export interface AuthorizedRequest {
  kind: "admin" | "automation";
  ownerTokenIdentifier: string;
}

type AuthRouteCtx = Pick<ActionCtx, "runMutation">;
type AuthCheck =
  | { response: Response; auth?: never }
  | { response: null; auth: AuthorizedRequest };

function getEnv() {
  return (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env;
}

function parseBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, token] = header.split(/\s+/, 2);
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

async function requireAuth(
  ctx: AuthRouteCtx,
  request: Request,
  requiredScopes: AutomationScope[]
): Promise<AuthCheck> {
  const bearerToken = parseBearerToken(request);
  if (bearerToken) {
    try {
      const credential = await ctx.runMutation(api.automation.markCredentialUsed, {
        credentialSecret: bearerToken,
      });
      const missingScopes = requiredScopes.filter(
        (scope) => !credential.scopes.includes(scope)
      );
      if (missingScopes.length > 0) {
        return {
          response: jsonResponse({ error: "Forbidden", missingScopes }, 403),
        };
      }
      return {
        response: null,
        auth: {
          kind: "automation",
          ownerTokenIdentifier: credential.ownerTokenIdentifier,
        },
      };
    } catch {
      return { response: jsonResponse({ error: "Unauthorized" }, 401) };
    }
  }

  const env = getEnv();
  if (request.headers.has("x-api-key")) {
    const authError = requireApiKeyAuth({
      request,
      envKey: env?.CONVEX_HTTP_API_KEY,
    });
    if (authError) {
      return { response: authError };
    }
    const ownerTokenIdentifier = env?.PRAVAH_HTTP_OWNER_TOKEN_IDENTIFIER;
    if (!ownerTokenIdentifier) {
      return {
        response: jsonResponse(
          {
            error:
              "Server configuration error: PRAVAH_HTTP_OWNER_TOKEN_IDENTIFIER is required for API key auth",
          },
          500
        ),
      };
    }
    return {
      response: null,
      auth: { kind: "admin", ownerTokenIdentifier },
    };
  }

  return { response: jsonResponse({ error: "Unauthorized" }, 401) };
}

export function requireTaskReadAuth(ctx: AuthRouteCtx, request: Request) {
  return requireAuth(ctx, request, ["tasks:read"]);
}

export function requireTaskWriteAuth(ctx: AuthRouteCtx, request: Request) {
  return requireAuth(ctx, request, ["tasks:write"]);
}

export function requireReviewReadAuth(ctx: AuthRouteCtx, request: Request) {
  return requireAuth(ctx, request, ["review:read"]);
}

export function requireSyncReadAuth(ctx: AuthRouteCtx, request: Request) {
  return requireAuth(ctx, request, ["sync:read"]);
}

export function requireIdempotencyKey(
  request: Request,
  auth: AuthorizedRequest
): { key?: string; response: Response | null } {
  if (auth.kind === "admin") {
    return { response: null };
  }

  const key = request.headers.get("idempotency-key")?.trim();
  if (!key || key.length > 200) {
    return {
      response: jsonResponse(
        { error: "Idempotency-Key header must be between 1 and 200 characters" },
        400
      ),
    };
  }
  return { key, response: null };
}

export function requireLegacyAuth(request: Request): Response | null {
  return requireApiKeyAuth({
    request,
    envKey: getEnv()?.CONVEX_HTTP_API_KEY,
  });
}
