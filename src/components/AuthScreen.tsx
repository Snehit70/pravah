import { useState } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { authClient } from "../lib/auth-client";

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
      // Successful sign-in redirects away from this screen.
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      setError(message);
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#05070d] text-zinc-100">
      <picture className="absolute inset-0">
        <source srcSet="/images/auth-hero.webp" type="image/webp" />
        <img
          src="/images/auth-hero.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full object-cover"
        />
      </picture>
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,7,13,0.26)_0%,rgba(5,7,13,0.56)_48%,rgba(5,7,13,0.94)_100%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_68%_46%,rgba(167,139,250,0.12),transparent_34%),linear-gradient(180deg,rgba(5,7,13,0.08),rgba(5,7,13,0.86))]" />

      <div className="relative z-10 flex min-h-screen flex-col px-6 py-6 sm:px-10 lg:px-16">
        <header className="flex items-center justify-between">
          <span className="text-sm font-semibold tracking-[0.28em] text-zinc-200">PRAVAH</span>
          <span className="tabular hidden text-[11px] uppercase tracking-[0.16em] text-zinc-500 sm:inline">
            Private Workspace
          </span>
        </header>

        <section className="flex flex-1 items-end pb-10 pt-16 lg:items-center lg:pb-0">
          <div className="w-full max-w-6xl">
            <p className="mb-5 max-w-sm text-[11px] font-medium uppercase tracking-[0.22em] text-zinc-400">
              Timeline-first planning
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[0.92] tracking-tight text-white sm:text-6xl lg:text-7xl">
              Enter the workspace before the week enters you.
            </h1>
            <div className="mt-8 flex max-w-4xl flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <p className="max-w-xl text-base leading-7 text-zinc-300">
                Sign in once with Google. Calendar and Gmail permissions stay separate,
                and can be granted later from Settings.
              </p>

              <div className="w-full max-w-sm lg:ml-8">
                <p className="mb-3 text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  Secure app login
                </p>

                {error ? (
                  <div className="mb-3 rounded-[6px] border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                    {error}
                  </div>
                ) : null}

                <button
                  type="button"
                  className="group flex h-12 w-full items-center justify-center gap-2 rounded-[6px] border border-white/15 bg-white text-sm font-semibold !text-[#090a0f] shadow-[0_18px_48px_rgba(0,0,0,0.35)] transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busy}
                  onClick={handleGoogleSignIn}
                >
                  {busy ? (
                    <span className="inline-flex items-center gap-2 text-[#090a0f]">
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Redirecting...
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-[#090a0f]">
                      <LogIn className="h-4 w-4" />
                      Continue with Google
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
