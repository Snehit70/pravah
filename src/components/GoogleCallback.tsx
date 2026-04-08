import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { exchangeGoogleAuthCode, saveGoogleTokens } from "../lib/google/api";
import { useToast } from "./useToast";

export function GoogleCallback() {
  const [processed, setProcessed] = useState(false);
  const upsertIntegration = useMutation(api.sync.upsertIntegration);
  const { showError, showSuccess } = useToast();

  useEffect(() => {
    if (processed) return;

    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");

    if (!code && !error) {
      return;
    }

    setProcessed(true);

    const handleCallback = async () => {
      if (error) {
        showError("Google sign-in was cancelled or failed.");
        cleanupUrl();
        return;
      }

      try {
        const tokens = await exchangeGoogleAuthCode(code!);
        saveGoogleTokens(tokens.accessToken, tokens.expiresIn);
        await upsertIntegration({
          provider: "google_calendar",
          status: "connected",
          syncEnabled: true,
          accessToken: tokens.accessToken,
          tokenExpiresAt: Date.now() + tokens.expiresIn * 1000,
        });
        showSuccess("Google connected successfully!");
      } catch (err) {
        console.error("Google OAuth callback failed", err);
        showError("Failed to complete Google sign-in.");
      } finally {
        cleanupUrl();
      }
    };

    const cleanupUrl = () => {
      url.searchParams.delete("code");
      url.searchParams.delete("scope");
      url.searchParams.delete("authuser");
      url.searchParams.delete("prompt");
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.toString());
    };

    handleCallback();
  }, [processed, showError, showSuccess]);

  return null;
}
