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
    authSignInSocialMock.mockResolvedValue(undefined);
    authSignOutMock.mockResolvedValue(undefined);
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

    resolveSignOut?.();
    await signOutPromise;
    expect(signOutPromise).not.toBeNull();
  });
});
