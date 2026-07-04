import { describe, expect, it, vi } from "vitest";

import {
  checkForAppUpdate,
  fetchMobileReleases,
  resolveReleaseFeed,
  resolveUpdate,
  type GitHubRelease,
} from "../lib/appUpdate";

function release(
  tag: string,
  options: Partial<GitHubRelease> = {},
): GitHubRelease {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    body: "Notes",
    assets: [
      { name: "pravah.apk", browser_download_url: "https://example.com/pravah.apk" },
      { name: "pravah.apk.md5", browser_download_url: "https://example.com/pravah.apk.md5" },
    ],
    ...options,
  };
}

describe("resolveUpdate", () => {
  it("selects the highest newer mobile release and ignores other products", () => {
    expect(
      resolveUpdate("2.3.0", [
        release("web-v9.0.0"),
        release("cli-v9.0.0"),
        release("mobile-v2.4.0"),
        release("mobile-v2.3.1"),
      ]),
    ).toMatchObject({
      status: "update-available",
      version: "2.4.0",
      apkUrl: "https://example.com/pravah.apk",
      md5Url: "https://example.com/pravah.apk.md5",
      releaseNotes: "Notes",
    });
  });

  it("reports up to date when mobile releases are equal or older", () => {
    expect(resolveUpdate("2.3.0", [release("mobile-v2.3.0"), release("mobile-v2.2.9")])).toEqual({
      status: "up-to-date",
    });
  });

  it("excludes drafts and prereleases", () => {
    expect(
      resolveUpdate("2.3.0", [
        release("mobile-v2.4.0", { draft: true }),
        release("mobile-v2.5.0", { prerelease: true }),
      ]),
    ).toEqual({ status: "up-to-date" });
  });

  it("fails safe on malformed current version", () => {
    expect(resolveUpdate("dev", [release("mobile-v2.4.0")])).toEqual({
      status: "malformed-metadata",
    });
  });

  it("ignores malformed release tags", () => {
    expect(resolveUpdate("2.3.0", [release("mobile-vnext")])).toEqual({
      status: "up-to-date",
    });
  });

  it("reports missing asset for a newer release without an apk or checksum", () => {
    expect(
      resolveUpdate("2.3.0", [
        release("mobile-v2.4.0", {
          assets: [{ name: "notes.txt", browser_download_url: "https://example.com/notes.txt" }],
        }),
      ]),
    ).toEqual({ status: "missing-asset", version: "2.4.0" });
  });
});
describe("checkForAppUpdate", () => {
  it("maps rate limits distinctly from offline failures", async () => {
    const fetchImpl = vi.fn(async () => new Response("{}", {
      status: 403,
      headers: { "x-ratelimit-remaining": "0", "retry-after": "120" },
    }));

    await expect(checkForAppUpdate("2.3.0", fetchImpl as typeof fetch)).resolves.toEqual({
      status: "rate-limited",
      retryAfter: "120",
    });
  });

  it("maps network throws to offline", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });

    await expect(checkForAppUpdate("2.3.0", fetchImpl as typeof fetch)).resolves.toEqual({
      status: "offline",
    });
  });

  it("maps invalid JSON to malformed metadata", async () => {
    const fetchImpl = vi.fn(async () => new Response("not-json"));

    await expect(checkForAppUpdate("2.3.0", fetchImpl as typeof fetch)).resolves.toEqual({
      status: "malformed-metadata",
    });
  });

  it("maps invalid release shapes to malformed metadata", async () => {
    const fetchImpl = vi.fn(async () => Response.json([{}, null]));

    await expect(checkForAppUpdate("2.3.0", fetchImpl as typeof fetch)).resolves.toEqual({
      status: "malformed-metadata",
    });
  });

  it("passes successful GitHub release lists through resolution", async () => {
    const fetchImpl = vi.fn(async () => Response.json([release("mobile-v2.4.0")]));

    await expect(checkForAppUpdate("2.3.0", fetchImpl as typeof fetch)).resolves.toMatchObject({
      status: "update-available",
      version: "2.4.0",
    });
  });
});

describe("resolveReleaseFeed", () => {
  it("lists mobile releases newest-first, ignoring other products, drafts, and prereleases", () => {
    expect(
      resolveReleaseFeed([
        release("web-v9.0.0"),
        release("mobile-v2.3.0", { body: "Older notes" }),
        release("mobile-v2.4.0", { body: "Newer notes" }),
        release("mobile-v2.5.0", { draft: true }),
        release("mobile-v2.6.0", { prerelease: true }),
        release("mobile-vnext"),
      ]),
    ).toEqual([
      { version: "2.4.0", notes: "Newer notes" },
      { version: "2.3.0", notes: "Older notes" },
    ]);
  });

  it("falls back to placeholder notes for empty bodies", () => {
    expect(resolveReleaseFeed([release("mobile-v2.4.0", { body: "  " })])).toEqual([
      { version: "2.4.0", notes: "No release notes provided." },
    ]);
  });
});

describe("fetchMobileReleases", () => {
  it("returns the resolved feed on success", async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json([release("mobile-v2.4.0", { body: "Notes" })]),
    );

    await expect(fetchMobileReleases(fetchImpl as typeof fetch)).resolves.toEqual({
      status: "ok",
      releases: [{ version: "2.4.0", notes: "Notes" }],
    });
  });

  it("shares transport error mapping with update checks", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("offline");
    });

    await expect(fetchMobileReleases(fetchImpl as typeof fetch)).resolves.toEqual({
      status: "offline",
    });
  });
});
