# Mobile Auth Flow

This document describes the current mobile authentication flow in `apps/mobile`
and the expected behavior under normal and failure conditions.

## Scope

- Mobile sign-in with Google -> Better Auth -> Convex session
- Mobile sign-out and account clearing
- Session bootstrap handoff to workspace loading
- Failure handling and diagnostics signals

## Core Files

- `apps/mobile/src/hooks/useGoogleAuth.ts`
- `apps/mobile/src/lib/auth-client.ts`
- `apps/mobile/src/hooks/useWorkspaceState.ts`
- `apps/mobile/App.tsx`
- `apps/mobile/src/components/MobileAuthScreen.tsx`

## Sign-In Flow

1. User taps **Continue with Google** on `MobileAuthScreen`.
2. `useGoogleAuth.handleGoogleSignIn` checks guardrails:
   - Google client id configured
   - not currently signing in
   - not currently signing out
3. Google native SDK flow runs:
   - `GoogleSignin.hasPlayServices(...)`
   - `GoogleSignin.signIn()`
4. If successful, extract `idToken`.
5. Call `authClient.signIn.social({ provider: "google", idToken, callbackURL: "/" })`.
6. Better Auth session resolves; `useWorkspaceState` transitions app from auth
   screen to workspace shell.

## Sign-Out Flow

1. User triggers sign-out from settings.
2. App closes settings sheet and clears workspace snapshot.
3. `useGoogleAuth.handleSignOut` runs:
   - sets `isSigningOut = true`
   - retries `authClient.signOut()` up to 3 attempts
   - each attempt has a 10s timeout guard
   - logs diagnostics (`signout_started`, `signout_retry`, `signout_succeeded`, `signout_failed`)
4. Native Google account cache is cleared via `GoogleSignin.signOut()` in a
   non-fatal path (`google_native_signout_failed` on error).
5. `isSigningOut` resets to false.

## Race Guards

- Sign-in is blocked while sign-out is running.
- Auth button state reflects both `isSigningIn` and `isSigningOut`.
- This prevents overlapping auth transitions that can leave session state ambiguous.

## Failure Behavior

If Better Auth sign-out fails after retries:

- User is not blocked from returning to auth screen.
- Error toast informs that sign-out may be incomplete.
- Failure is recorded in diagnostics logs for later export.

If native Google sign-out fails:

- App sign-out still proceeds.
- Failure is logged but does not block user flow.

## Diagnostics Signals

Auth events are recorded through mobile logger + diagnostics stream, including:

- `login_start`
- `google_signin_started`
- `google_signin_cancelled`
- `google_signin_succeeded`
- `google_signin_failed`
- `signout_confirmed`
- `signout_started`
- `signout_retry`
- `signout_succeeded`
- `signout_failed`
- `google_native_signout_failed`

These events should be included in shared diagnostics bundles during incident review.
