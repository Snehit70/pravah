import { afterEach, describe, expect, it, vi } from "vitest";

const { sign, endpoints } = vi.hoisted(() => ({
  sign: vi.fn(async () => "signed-token"),
  endpoints: [] as Array<(ctx: unknown) => Promise<unknown>>,
}));
vi.mock("better-auth/plugins/jwt", () => ({ signJWT: sign }));
vi.mock("better-auth/api", () => ({
  createAuthEndpoint: (_path: string, _options: unknown, handler: (ctx: unknown) => Promise<unknown>) => {
    endpoints.push(handler);
    return handler;
  },
}));
import { ownerConvexTokenPlugin, OWNER_TOKEN_TTL_SECONDS } from "../../convex/ownerConvexToken";

afterEach(() => { vi.useRealTimers(); sign.mockClear(); endpoints.length = 0; });

describe("owner websocket token claims", () => {
  it("preserves identity across refresh without inventing a Better Auth session", async () => {
    vi.useFakeTimers();
    const issuer = "https://canonical.convex.site";
    ownerConvexTokenPlugin({ convexSiteUrl: issuer });
    const invoke = async (subject: string) => endpoints[0]!({
      body: { subject, ttlSeconds: OWNER_TOKEN_TTL_SECONDS },
      json: (value: unknown) => value,
    });
    vi.setSystemTime(1_800_000_000_000);
    expect(await invoke("owner-a")).toEqual({token: "signed-token", expiresAt: 1_800_000_900_000});
    vi.setSystemTime(1_800_000_900_000);
    expect(await invoke("owner-a")).toEqual({token: "signed-token", expiresAt: 1_800_001_800_000});
    const first = sign.mock.calls[0] as unknown as [unknown, {payload: Record<string, unknown>; options: unknown}];
    const second = sign.mock.calls[1] as unknown as typeof first;
    const { iat: firstIat, ...firstIdentity } = first[1].payload;
    const { iat: secondIat, ...secondIdentity } = second[1].payload;
    expect(firstIdentity).toEqual({sub: "owner-a", iss: issuer, aud: "convex"});
    expect(secondIdentity).toEqual(firstIdentity);
    expect(secondIat).not.toBe(firstIat);
    expect(second[1].options).toMatchObject({jwt: {issuer, audience: "convex", expirationTime: "900s"}});
    await invoke("owner-b");
    expect((sign.mock.calls[2] as unknown as typeof first)[1].payload.sub).toBe("owner-b");
  });
});
