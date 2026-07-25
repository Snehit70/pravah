/** @vitest-environment happy-dom */

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const googleSignin = vi.hoisted(() => ({
  configure: vi.fn(),
  hasPlayServices: vi.fn(),
  signIn: vi.fn(),
  signOut: vi.fn(),
}));

const logger = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: googleSignin,
}));

vi.mock("../lib/haptic", () => ({
  haptic: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock("../lib/auth-client", () => ({
  authClient: {
    signIn: { social: vi.fn() },
    signOut: vi.fn(),
  },
}));

vi.mock("../lib/logger", () => ({
  classifyError: (error: unknown) => (error instanceof Error ? error.name : typeof error),
  createActionId: () => "auth-test",
  mobileLogger: logger,
}));

import { useGoogleAuth } from "../hooks/useGoogleAuth";

const showToast = vi.fn();

describe("useGoogleAuth configuration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not call the native module when the web client ID is missing", async () => {
    const { result } = renderHook(() =>
      useGoogleAuth({
        googleWebClientId: undefined,
        googleIosClientId: undefined,
        showToast,
      }),
    );

    await waitFor(() => expect(result.current.canGoogleSignIn).toBe(false));
    expect(googleSignin.configure).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith("google_signin_config_missing", {
      missingVariable: "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
    });
  });

  it("enables Google sign-in only after native configuration succeeds", async () => {
    const { result } = renderHook(() =>
      useGoogleAuth({
        googleWebClientId: "web-client-id",
        googleIosClientId: "ios-client-id",
        showToast,
      }),
    );

    await waitFor(() => expect(result.current.canGoogleSignIn).toBe(true));
    expect(googleSignin.configure).toHaveBeenCalledWith({
      webClientId: "web-client-id",
      iosClientId: "ios-client-id",
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      offlineAccess: true,
    });
  });

  it("keeps sign-in disabled when native configuration throws", async () => {
    googleSignin.configure.mockImplementationOnce(() => {
      throw new Error("invalid Google configuration");
    });

    const { result } = renderHook(() =>
      useGoogleAuth({
        googleWebClientId: "web-client-id",
        googleIosClientId: undefined,
        showToast,
      }),
    );

    await waitFor(() => expect(result.current.canGoogleSignIn).toBe(false));
    expect(logger.error).toHaveBeenCalledWith("google_signin_config_failed", {
      errorType: "Error",
      errorMessage: "invalid Google configuration",
    });
  });
});
