import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("better-auth/plugins/jwt", () => ({
  signJWT: async (_ctx: unknown, { payload }: { payload: unknown }) => JSON.stringify(payload),
}));
import {
  deriveConvexCloudUrl,
  ownerConvexTokenPlugin,
  splitOwnerTokenIdentifier,
} from "../../convex/ownerConvexToken";

describe("owner token minting", () => {
  afterEach(() => vi.useRealTimers());

  it("gives same-second mints distinct claims without changing owner identity", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T06:00:00Z"));
    const mint = ownerConvexTokenPlugin({ convexSiteUrl: "https://owner.convex.site" }).endpoints.mintOwnerConvexToken;
    const first = await mint({ body: { subject: "owner", ttlSeconds: 900 } });
    const second = await mint({ body: { subject: "owner", ttlSeconds: 900 } });
    expect(first.token).not.toBe(second.token);
    const claims = JSON.parse(first.token);
    const nextClaims = JSON.parse(second.token);
    expect(claims.iat).toBe(nextClaims.iat);
    expect(claims.sub).toBe("owner");
    expect(nextClaims.sub).toBe(claims.sub);
    expect(nextClaims.iss).toBe(claims.iss);
    expect(claims.jti).toEqual(expect.any(String));
    expect(first.expiresAt).toBe(second.expiresAt);
  });
});

describe("splitOwnerTokenIdentifier", () => {
  it("splits a Convex tokenIdentifier back into its claims", () => {
    expect(
      splitOwnerTokenIdentifier(
        "https://combative-zebra-261.eu-west-1.convex.site|k171qspc12y3frt6qb6mtnq3jn84r59q"
      )
    ).toEqual({
      issuer: "https://combative-zebra-261.eu-west-1.convex.site",
      subject: "k171qspc12y3frt6qb6mtnq3jn84r59q",
    });
  });

  it("keeps pipes inside the subject with the issuer", () => {
    expect(splitOwnerTokenIdentifier("https://issuer.example|user|with|pipes")).toEqual({
      issuer: "https://issuer.example",
      subject: "user|with|pipes",
    });
  });

  it("rejects values that are not `${issuer}|${subject}`", () => {
    expect(splitOwnerTokenIdentifier("")).toBeNull();
    expect(splitOwnerTokenIdentifier("no-separator")).toBeNull();
    expect(splitOwnerTokenIdentifier("|only-subject")).toBeNull();
    expect(splitOwnerTokenIdentifier("only-issuer|")).toBeNull();
    expect(splitOwnerTokenIdentifier("|")).toBeNull();
  });
});

describe("deriveConvexCloudUrl", () => {
  it("points a Convex site url at its websocket deployment", () => {
    expect(deriveConvexCloudUrl("https://x.eu-west-1.convex.site")).toBe(
      "https://x.eu-west-1.convex.cloud"
    );
  });

  it("leaves a non-Convex host untouched", () => {
    expect(deriveConvexCloudUrl("https://pravah.example")).toBe(
      "https://pravah.example"
    );
  });
});
