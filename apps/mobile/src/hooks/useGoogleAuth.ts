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
  canGoogleSignIn: boolean;
  handleGoogleSignIn: () => Promise<void>;
  handleSignOut: () => void;
};

export function useGoogleAuth({
  googleWebClientId,
  googleIosClientId,
  showToast,
}: UseGoogleAuthOptions): UseGoogleAuthReturn {
  const [isSigningIn, setIsSigningIn] = useState(false);
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
    if (!googleWebClientId || isSigningIn) return;
    const actionId = createActionId("auth");
    const startedAt = Date.now();
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
    } finally {
      setIsSigningIn(false);
    }
  }, [googleWebClientId, isSigningIn, showToast]);

  const handleSignOut = useCallback(() => {
    mobileLogger.info("signout_confirmed");
    haptic.warning();
    void authClient.signOut();
    // Clear the native Google account so the next sign-in prompts account
    // selection rather than silently reusing the cached account.
    void GoogleSignin.signOut().catch(() => undefined);
  }, []);

  return { isSigningIn, canGoogleSignIn, handleGoogleSignIn, handleSignOut };
}
