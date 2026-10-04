import { createAuthEndpoint } from "better-auth/api";
import { signJWT, type Jwk } from "better-auth/plugins/jwt";
import { z } from "zod";

/**
 * Convex derives `identity.tokenIdentifier` as `${iss}|${sub}` for every JWT
 * provider, so an automation credential's stored `ownerTokenIdentifier` can be
 * split back into the two claims needed to mint a token for the same owner.
 * Splitting on the first `|` is safe: an issuer never contains one, while a JWT
 * `sub` is free-form and may.
 */
export function splitOwnerTokenIdentifier(
  ownerTokenIdentifier: string
): { issuer: string; subject: string } | null {
  const separator = ownerTokenIdentifier.indexOf("|");
  if (separator <= 0) return null;
  const issuer = ownerTokenIdentifier.slice(0, separator);
  const subject = ownerTokenIdentifier.slice(separator + 1);
  if (issuer.length === 0 || subject.length === 0) return null;
  return { issuer, subject };
}

/** `https://x.eu-west-1.convex.site` -> `https://x.eu-west-1.convex.cloud`. */
export function deriveConvexCloudUrl(convexSiteUrl: string): string {
  return convexSiteUrl.replace(/\.convex\.site$/, ".convex.cloud");
}

export const OWNER_TOKEN_TTL_SECONDS = 15 * 60;
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 60 * 60;

const mintBodySchema = z.object({
  subject: z.string().min(1).max(512),
  ttlSeconds: z
    .number()
    .int()
    .min(MIN_TTL_SECONDS)
    .max(MAX_TTL_SECONDS)
    .default(OWNER_TOKEN_TTL_SECONDS),
});

/** Better Auth's `jwks.adapter` option type, taken from the signer itself. */
type JwksAdapter = NonNullable<
  NonNullable<Parameters<typeof signJWT>[1]["options"]>["adapter"]
>;
type ReadJwks = NonNullable<JwksAdapter["getJwks"]>;

/**
 * The Convex component stores jwks rows with numeric timestamps, but Better
 * Auth's key selection calls `createdAt.getTime()`. This mirrors the Convex
 * plugin's own `jwks.adapter.getJwks` so the same key row is selected, and so
 * the `kid` header matches the published JWKS.
 */
async function readJwks(ctx: Parameters<ReadJwks>[0]): Promise<Jwk[]> {
  const keys = (await ctx.context.adapter.findMany({ model: "jwks" })) as Array<
    Omit<Jwk, "createdAt" | "expiresAt"> & {
      createdAt: number;
      expiresAt?: number | null;
      _id?: string;
    }
  >;
  return keys.map((key) => ({
    id: key.id || key._id || "",
    publicKey: key.publicKey,
    privateKey: key.privateKey,
    alg: key.alg,
    crv: key.crv,
    createdAt: new Date(key.createdAt),
    ...(key.expiresAt ? { expiresAt: new Date(key.expiresAt) } : {}),
  }));
}

/**
 * Signs a Convex websocket token for an existing owner using the same Better
 * Auth JWKS key that `convex/auth.config.ts` publishes, so the existing
 * `customJwt` provider accepts it without adding a second provider entry.
 *
 * The endpoint is reachable only through `auth.api.mintOwnerConvexToken` from a
 * Convex function. It is never mounted as an HTTP route, so the sole caller is
 * `POST /automation/convex-token`, which has already resolved an automation
 * bearer to an owner.
 */
export function ownerConvexTokenPlugin({
  convexSiteUrl,
}: {
  convexSiteUrl: string;
}) {
  return {
    id: "pravah-owner-convex-token",
    endpoints: {
      mintOwnerConvexToken: createAuthEndpoint(
        "/convex/mint-owner-token",
        {
          method: "POST",
          isAction: true,
          body: mintBodySchema,
          metadata: {
            SERVER_ONLY: true,
            openapi: {
              description:
                "Mint a short-lived Convex websocket token for an automation credential's owner.",
            },
          },
        },
        async (ctx) => {
          const { subject, ttlSeconds } = ctx.body;
          const issuedAt = Math.floor(Date.now() / 1000);

          const token = await signJWT(ctx, {
            options: {
              jwt: {
                issuer: convexSiteUrl,
                audience: "convex",
                expirationTime: `${ttlSeconds}s`,
              },
              jwks: { keyPairConfig: { alg: "RS256" } },
              adapter: { getJwks: readJwks },
            },
            payload: {
              sub: subject,
              iss: convexSiteUrl,
              aud: "convex",
              iat: issuedAt,
              // Convex schedules refresh only when the replacement JWT differs.
              // Immediate forced refreshes can mint twice in the same second.
              jti: crypto.randomUUID(),
              // Not a Better Auth session. Convex never reads it, but the Convex
              // plugin's own payload shape includes one.
              sessionId: `pravah-cli-${issuedAt}`,
            },
          });

          return ctx.json({ token, expiresAt: (issuedAt + ttlSeconds) * 1000 });
        }
      ),
    },
  };
}
