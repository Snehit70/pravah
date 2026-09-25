import { describe, expect, it } from "vitest";
import { resolveCliHttpUrl } from "../../packages/cli/src/liveClient";

describe("Pravah CLI endpoint resolution", () => {
  it("uses an explicit self-hosted HTTP-actions origin", () => {
    expect(resolveCliHttpUrl({
      CONVEX_SELF_HOSTED_SITE_URL: "https://actions.example.com/",
      CONVEX_URL: "https://api.example.com",
    })).toBe("https://actions.example.com");
  });

  it("keeps the current cloud fallback when no self-hosted origin is configured", () => {
    expect(resolveCliHttpUrl({})).toBe("https://combative-zebra-261.eu-west-1.convex.site");
  });
});
