import { useState } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { authClient } from "../lib/auth-client";
import { Button } from "./Button";

export function AuthScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError(null);

    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/",
      });
      if (result.error) {
        throw new Error(result.error.message ?? "Could not sign you in with Google.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      setError(message);
      setBusy(false);
    } finally {
      // Successful sign-in redirects away from this screen.
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,#153764_0%,#0f172a_40%,#060816_100%)] px-6 py-12">
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(35,131,226,0.18),transparent_35%,rgba(255,255,255,0.02)_70%,transparent)]" />
      <div className="absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-400/10 blur-3xl" />

      <div className="relative z-10 grid w-full max-w-5xl gap-10 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="flex flex-col justify-center rounded-[2rem] border border-white/10 bg-white/6 p-8 backdrop-blur-xl lg:p-12">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.28em] text-blue-200/80">
            Private planning workspace
          </p>
          <h1
            className="max-w-xl text-4xl font-semibold tracking-tight text-white lg:text-6xl"
            style={{ fontFamily: "'Newsreader', Georgia, serif" }}
          >
            Keep Pravah behind a real sign-in before you ship it.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            Google OAuth now gates the app, and each account only sees its own tasks
            and sync metadata.
          </p>
        </section>

        <section className="rounded-[2rem] border border-white/10 bg-slate-950/85 p-6 shadow-2xl shadow-blue-950/40 backdrop-blur-xl lg:p-8">
          <p className="mb-2 text-sm font-medium text-slate-200">Sign in with Google</p>
          <p className="mb-6 text-sm leading-6 text-slate-400">
            Use the same Google account you want to connect for calendar and Gmail sync.
          </p>

          {error ? (
            <div className="mb-4 rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          ) : null}

          <Button
            type="button"
            size="lg"
            className="w-full justify-center bg-white text-slate-950 hover:bg-slate-100"
            disabled={busy}
            onClick={handleGoogleSignIn}
          >
            {busy ? (
              <span className="inline-flex items-center gap-2">
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Redirecting...
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <LogIn className="h-4 w-4" />
                Continue with Google
              </span>
            )}
          </Button>
        </section>
      </div>
    </div>
  );
}
