import { useCallback, useEffect, useState } from "react";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { haptic } from "../lib/haptic";
import { authClient } from "../lib/auth-client";
import { classifyError, createActionId, mobileLogger } from "../lib/logger";

type ToastState = { kind: "error" | "info"; message: string };
type ShowToast = (next: ToastState) => void;

type UseGoogleAuthOptions = {
  googleWebClientId: string | undefined;
  googleIosClientId: string | undefined;
  showToast: ShowToast;
};

type UseGoogleAuthReturn = {
  isSigningIn: boolean;
  isSigningOut: boolean;
  canGoogleSignIn: boolean;
  handleGoogleSignIn: () => Promise<void>;
  handleSignOut: () => Promise<void>;
};

export function useGoogleAuth({
  googleWebClientId,
  googleIosClientId,
  showToast,
}: UseGoogleAuthOptions): UseGoogleAuthReturn {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const canGoogleSignIn = Boolean(googleWebClientId);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: googleWebClientId,
      iosClientId: googleIosClientId,
      scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
      offlineAccess: true,
    });
  }, [googleWebClientId, googleIosClientId]);

  const handleGoogleSignIn = useCallback(async () => {
    if (!googleWebClientId || isSigningIn || isSigningOut) return;
    const actionId = createActionId("auth");
    const startedAt = Date.now();
    mobileLogger.info("login_start", { actionId, provider: "google" });
    mobileLogger.info("google_signin_started", { actionId });
    setIsSigningIn(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      const result = await GoogleSignin.signIn();
      if (result.type !== "success") {
        mobileLogger.info("google_signin_cancelled", { actionId });
        return;
      }
      const idToken = result.data.idToken;
      if (!idToken) {
        showToast({ kind: "error", message: "Google sign-in did not return an ID token." });
        return;
      }
      await authClient.signIn.social({
        provider: "google",
        idToken: { token: idToken },
        callbackURL: "/",
      });
      mobileLogger.info("login_success", { actionId, provider: "google", elapsedMs: Date.now() - startedAt });
      mobileLogger.info("google_signin_succeeded", { actionId, elapsedMs: Date.now() - startedAt });
    } catch (error) {
      const errorCode =
        typeof error === "object" && error !== null && "code" in error
          ? (error as { code?: unknown }).code
          : undefined;
      const errorName =
        typeof error === "object" && error !== null && "name" in error
          ? (error as { name?: unknown }).name
          : undefined;
      const errorMessage =
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : "unknown";

      showToast({ kind: "error", message: "Google sign-in failed. Check OAuth client setup." });
      haptic.error();
      mobileLogger.error("google_signin_failed", {
        actionId,
        elapsedMs: Date.now() - startedAt,
        errorType: classifyError(error),
        errorCode,
        errorName,
        errorMessage,
      });
      mobileLogger.error("login_failed", {
        actionId,
        provider: "google",
        elapsedMs: Date.now() - startedAt,
        errorType: classifyError(error),
      });
    } finally {
      setIsSigningIn(false);
    }
  }, [googleWebClientId, isSigningIn, isSigningOut, showToast]);

  const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label}_timeout`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return;
    const actionId = createActionId("auth");
    const startedAt = Date.now();
    mobileLogger.info("signout_confirmed", { actionId });
    mobileLogger.info("signout_started", { actionId });
    haptic.warning();
    setIsSigningOut(true);
    let signedOut = false;
    let lastError: unknown = null;
    const maxAttempts = 3;

    try {
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await withTimeout(authClient.signOut(), 10_000, "auth_signout");
          signedOut = true;
          mobileLogger.info("signout_succeeded", {
            actionId,
            attempt,
            elapsedMs: Date.now() - startedAt,
          });
          break;
        } catch (error) {
          lastError = error;
          mobileLogger.warn("signout_retry", {
            actionId,
            attempt,
            maxAttempts,
            errorType: classifyError(error),
          });
        }
      }

      if (!signedOut) {
        showToast({
          kind: "error",
          message: "Sign-out may be incomplete due to network. You can sign in again.",
        });
        mobileLogger.error("signout_failed", {
          actionId,
          elapsedMs: Date.now() - startedAt,
          errorType: classifyError(lastError),
        });
      }
    } finally {
      // Clear the native Google account so the next sign-in prompts account
      // selection rather than silently reusing the cached account.
      try {
        await GoogleSignin.signOut();
      } catch (error) {
        mobileLogger.warn("google_native_signout_failed", {
          actionId,
          errorType: classifyError(error),
        });
      }
      setIsSigningOut(false);
    }
  }, [isSigningOut, showToast]);

  return { isSigningIn, isSigningOut, canGoogleSignIn, handleGoogleSignIn, handleSignOut };
}
