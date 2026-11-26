/** @vitest-environment happy-dom */
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

const googleConfigureMock = vi.fn();
const googleHasPlayServicesMock = vi.fn();
const googleSignInMock = vi.fn();
const googleSignOutMock = vi.fn();
const authSignInSocialMock = vi.fn();
const authSignOutMock = vi.fn();
const toastMock = vi.fn();
const hapticWarningMock = vi.fn();
const hapticErrorMock = vi.fn();
const loggerInfoMock = vi.fn();
const loggerWarnMock = vi.fn();
const loggerErrorMock = vi.fn();

vi.mock("@react-native-google-signin/google-signin", () => ({
  GoogleSignin: {
    configure: (...args: unknown[]) => googleConfigureMock(...args),
    hasPlayServices: (...args: unknown[]) => googleHasPlayServicesMock(...args),
    signIn: (...args: unknown[]) => googleSignInMock(...args),
    signOut: (...args: unknown[]) => googleSignOutMock(...args),
  },
}));

vi.mock("../lib/auth-client", () => ({
  authClient: {
    signIn: {
      social: (...args: unknown[]) => authSignInSocialMock(...args),
    },
    signOut: (...args: unknown[]) => authSignOutMock(...args),
  },
}));

vi.mock("../lib/haptic", () => ({
  haptic: {
    warning: () => hapticWarningMock(),
    error: () => hapticErrorMock(),
  },
}));

vi.mock("../lib/logger", () => ({
  classifyError: () => "network",
  createActionId: () => "auth-test-action",
  mobileLogger: {
    info: (...args: unknown[]) => loggerInfoMock(...args),
    warn: (...args: unknown[]) => loggerWarnMock(...args),
    error: (...args: unknown[]) => loggerErrorMock(...args),
    debug: vi.fn(),
  },
}));

import { useGoogleAuth } from "../hooks/useGoogleAuth";

describe("useGoogleAuth", () => {
  beforeEach(() => {
    googleConfigureMock.mockReset();
    googleHasPlayServicesMock.mockReset();
    googleSignInMock.mockReset();
    googleSignOutMock.mockReset();
    authSignInSocialMock.mockReset();
    authSignOutMock.mockReset();
    toastMock.mockReset();
    hapticWarningMock.mockReset();
    hapticErrorMock.mockReset();
    loggerInfoMock.mockReset();
    loggerWarnMock.mockReset();
    loggerErrorMock.mockReset();

    googleHasPlayServicesMock.mockResolvedValue(undefined);
    googleSignInMock.mockResolvedValue({
      type: "success",
      data: { idToken: "id-token" },
    });
    googleSignOutMock.mockResolvedValue(undefined);
    authSignInSocialMock.mockResolvedValue({ data: { redirect: false }, error: null });
    authSignOutMock.mockResolvedValue(undefined);
  });

  function renderAuth() {
    return renderHook(() =>
      useGoogleAuth({
        googleWebClientId: "web-client-id",
        googleIosClientId: "ios-client-id",
        showToast: toastMock,
      })
    );
  }

  async function signIn(result: ReturnType<typeof renderAuth>["result"]) {
    await waitFor(() => expect(result.current.canGoogleSignIn).toBe(true));
    await act(async () => {
      await result.current.handleGoogleSignIn();
    });
  }

  it("logs success when the server accepts the Google ID token", async () => {
    const { result } = renderAuth();
    await signIn(result);

    expect(authSignInSocialMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google", idToken: { token: "id-token" } })
    );
    expect(loggerInfoMock).toHaveBeenCalledWith("login_success", expect.anything());
    expect(toastMock).not.toHaveBeenCalled();
    expect(result.current.isSigningIn).toBe(false);
  });

  it("surfaces a sign-in the server rejects instead of logging success", async () => {
    authSignInSocialMock.mockResolvedValue({
      data: null,
      error: { status: 404, statusText: "Not Found", code: "PROVIDER_NOT_FOUND", message: "Provider not found" },
    });
    const { result } = renderAuth();
    await signIn(result);

    expect(toastMock).toHaveBeenCalledWith({ kind: "error", message: "Sign-in rejected: Provider not found" });
    expect(hapticErrorMock).toHaveBeenCalled();
    expect(loggerErrorMock).toHaveBeenCalledWith(
      "login_failed",
      expect.objectContaining({ status: 404, errorCode: "PROVIDER_NOT_FOUND" })
    );
    expect(loggerInfoMock).not.toHaveBeenCalledWith("login_success", expect.anything());
    expect(result.current.isSigningIn).toBe(false);
  });

  it("falls back to the HTTP status when the rejection has no message", async () => {
    authSignInSocialMock.mockResolvedValue({ data: null, error: { status: 503, statusText: "" } });
    const { result } = renderAuth();
    await signIn(result);

    expect(toastMock).toHaveBeenCalledWith({ kind: "error", message: "Sign-in rejected: HTTP 503" });
  });

  it("retries sign-out and succeeds on a later attempt", async () => {
    authSignOutMock
      .mockRejectedValueOnce(new Error("network-1"))
      .mockRejectedValueOnce(new Error("network-2"))
      .mockResolvedValueOnce(undefined);

    const { result } = renderHook(() =>
      useGoogleAuth({
        googleWebClientId: "web-client-id",
        googleIosClientId: "ios-client-id",
        showToast: toastMock,
      })
    );

    await act(async () => {
      await result.current.handleSignOut();
    });

    expect(authSignOutMock).toHaveBeenCalledTimes(3);
    expect(googleSignOutMock).toHaveBeenCalledTimes(1);
    expect(loggerWarnMock).toHaveBeenCalled();
    expect(loggerInfoMock).toHaveBeenCalledWith(
      "signout_succeeded",
      expect.objectContaining({ actionId: "auth-test-action", attempt: 3 })
    );
    expect(toastMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: "error" })
    );
  });

  it("blocks sign-in attempts while sign-out is in progress", async () => {
    let resolveSignOut: (() => void) | null = null;
    authSignOutMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSignOut = resolve;
        })
    );

    const { result } = renderHook(() =>
      useGoogleAuth({
        googleWebClientId: "web-client-id",
        googleIosClientId: "ios-client-id",
        showToast: toastMock,
      })
    );

    let signOutPromise: Promise<void> | null = null;
    await act(async () => {
      signOutPromise = result.current.handleSignOut();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isSigningOut).toBe(true);
    });

    await act(async () => {
      await result.current.handleGoogleSignIn();
    });
    expect(authSignInSocialMock).not.toHaveBeenCalled();

    expect(signOutPromise).not.toBeNull();
    expect(resolveSignOut).not.toBeNull();
    const finishSignOut = resolveSignOut as (() => void) | null;
    finishSignOut?.();
    await signOutPromise;
  });
});
