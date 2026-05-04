import { describe, expect, it } from "vitest";

import { selectActiveSection } from "../lib/settingsSections";

const offsets = [
  { key: "assistant" as const, offset: 0 },
  { key: "sync" as const, offset: 400 },
  { key: "alerts" as const, offset: 900 },
  { key: "account" as const, offset: 1400 },
];

describe("selectActiveSection", () => {
  it("returns null for an empty offset list", () => {
    expect(selectActiveSection(0, [])).toBeNull();
    expect(selectActiveSection(500, [])).toBeNull();
  });

  it("returns the first section while still at the top of the scroll view", () => {
    expect(selectActiveSection(0, offsets, 24)).toBe("assistant");
    // A small amount of scrolling that hasn't reached the next section yet
    // must keep the first chip active — never null, never the next one.
    expect(selectActiveSection(50, offsets, 24)).toBe("assistant");
  });

  it("activates the next section once its header crosses the bias line", () => {
    // probe = scrollY + bias = 380, still under sync's offset (400)
    expect(selectActiveSection(356, offsets, 24)).toBe("assistant");
    // probe = 400, exactly at sync — inclusive boundary so sync wins
    expect(selectActiveSection(376, offsets, 24)).toBe("sync");
    expect(selectActiveSection(500, offsets, 24)).toBe("sync");
  });

  it("activates the last section when scrolled past the final offset", () => {
    expect(selectActiveSection(2000, offsets, 24)).toBe("account");
  });

  it("treats bias as additive headroom, so a larger bias activates earlier", () => {
    const eager = selectActiveSection(380, offsets, 32);
    const conservative = selectActiveSection(380, offsets, 0);
    expect(eager).toBe("sync");
    expect(conservative).toBe("assistant");
  });

  it("defaults to zero bias when omitted", () => {
    // Without bias, sync activates only once scrollY reaches its offset.
    expect(selectActiveSection(399, offsets)).toBe("assistant");
    expect(selectActiveSection(400, offsets)).toBe("sync");
  });
});
