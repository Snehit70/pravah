/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearGoogleTokens,
  fetchGoogleAccountEmail,
  fetchGmailMessages,
  getGoogleAuthErrorMessage,
  getGoogleTokens,
  parseGoogleTokens,
  resolveConvexHttpUrl,
  saveGoogleTokens,
} from "../lib/google/api";

describe("google api helpers", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("parses access token hash payload with explicit expiry", () => {
    const parsed = parseGoogleTokens("#access_token=abc123&expires_in=1800");
    expect(parsed).toEqual({
      accessToken: "abc123",
      expiresIn: 1800,
    });
  });

  it("defaults expiresIn when token hash omits expiry", () => {
    const parsed = parseGoogleTokens("#access_token=token_only");
    expect(parsed).toEqual({
      accessToken: "token_only",
      expiresIn: 3600,
    });
  });

  it("stores and reads token expiry correctly", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 9, 10, 0, 0));

    saveGoogleTokens("token-1", 60);
    expect(getGoogleTokens()).toEqual({
      accessToken: "token-1",
      expired: false,
    });

    vi.setSystemTime(new Date(2026, 3, 9, 10, 2, 0));
    expect(getGoogleTokens()).toEqual({
      accessToken: "token-1",
      expired: true,
    });
  });

  it("clears persisted tokens", () => {
    saveGoogleTokens("token-2", 3600);
    clearGoogleTokens();
    expect(getGoogleTokens()).toBeNull();
  });

  it("fetches gmail message list payload", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "m1", threadId: "t1" }] }),
    } as Response);

    const messages = await fetchGmailMessages("access", "is:unread from:boss", 5);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "query=is%3Aunread%20from%3Aboss&maxResults=5"
    );
    expect(messages).toEqual([{ id: "m1", threadId: "t1" }]);
  });

  it("throws when gmail list endpoint fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      statusText: "Unauthorized",
    } as Response);

    await expect(fetchGmailMessages("bad-token")).rejects.toThrow(
      "Failed to fetch gmail messages: Unauthorized"
    );
  });

  it("fetches account email via gmail profile endpoint", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ emailAddress: "user@example.com" }),
    } as Response);

    await expect(fetchGoogleAccountEmail("access")).resolves.toBe("user@example.com");
  });

  it("formats oauth error messages safely", () => {
    expect(getGoogleAuthErrorMessage(new Error("PKCE missing"), "fallback")).toBe(
      "PKCE missing"
    );
    expect(getGoogleAuthErrorMessage("oops", "fallback")).toBe("fallback");
  });

  it("resolves convex http url from explicit env or cloud fallback", () => {
    expect(
      resolveConvexHttpUrl({
        VITE_CONVEX_HTTP_URL: "https://abc.convex.site/",
      })
    ).toBe("https://abc.convex.site");

    expect(
      resolveConvexHttpUrl({
        VITE_CONVEX_SITE_URL: "https://xyz.convex.site",
      })
    ).toBe("https://xyz.convex.site");

    expect(
      resolveConvexHttpUrl({
        VITE_CONVEX_URL: "https://befitting-swan-125.eu-west-1.convex.cloud",
      })
    ).toBe("https://befitting-swan-125.eu-west-1.convex.site");
  });
});
