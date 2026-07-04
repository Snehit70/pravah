import { describe, expect, it } from "vitest";

import { parseReleaseNotes } from "../lib/releaseNotes";

describe("parseReleaseNotes", () => {
  it("parses release-please bodies into headings and bullets", () => {
    const body = [
      "## [3.1.0](https://github.com/Snehit70/pravah/compare/mobile-v3.0.0...mobile-v3.1.0) (2026-07-01)",
      "",
      "### Features",
      "",
      "* **mobile:** add What's new sheet ([#140](https://github.com/Snehit70/pravah/issues/140)) ([abc1234](https://github.com/Snehit70/pravah/commit/abc1234))",
      "* animate task color selection ([def5678](https://github.com/Snehit70/pravah/commit/def5678))",
      "",
      "### Bug Fixes",
      "",
      "- clarify installed vs available APK copy",
    ].join("\n");

    expect(parseReleaseNotes(body)).toEqual([
      { type: "heading", text: "Features" },
      { type: "bullet", text: "mobile: add What's new sheet (#140)" },
      { type: "bullet", text: "animate task color selection" },
      { type: "heading", text: "Bug Fixes" },
      { type: "bullet", text: "clarify installed vs available APK copy" },
    ]);
  });

  it("drops version-only headings but keeps named ones", () => {
    expect(parseReleaseNotes("## 3.0.0 (2026-06-20)\n### Features\ntext")).toEqual([
      { type: "heading", text: "Features" },
      { type: "paragraph", text: "text" },
    ]);
  });

  it("strips bold, code, and link markup from paragraphs", () => {
    expect(parseReleaseNotes("**Bold** and `code` and [a link](https://x.dev).")).toEqual([
      { type: "paragraph", text: "Bold and code and a link." },
    ]);
  });

  it("returns nothing for empty or whitespace bodies", () => {
    expect(parseReleaseNotes("")).toEqual([]);
    expect(parseReleaseNotes("\n \n")).toEqual([]);
  });
});
