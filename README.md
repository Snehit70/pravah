# Pravah

Pravah is a React + Vite task-planning app backed by Convex, with Google OAuth for app login and optional Google Calendar/Gmail integration.

## Monorepo Layout

- `.`: web app (React + Vite + Convex)
- `apps/mobile`: Expo React Native app

## Local Development

1. Install dependencies:

```bash
bun install
```

2. Start Convex dev:

```bash
bunx convex dev
```

3. Start the frontend:

```bash
bun run dev
```

4. Start the mobile app (Expo):

```bash
bun run mobile:start
```

For native dev build (recommended for Google sign-in modal):

```bash
bun run mobile:android
bun run mobile:android:dev
```

You can also run:

- `bun run mobile:android`
- `bun run mobile:android:dev`
- `bun run mobile:ios`
- `bun run mobile:web`

### Mobile Environment (`apps/mobile/.env.local`)

Generate mobile env from root `.env.local`:

```bash
bun run mobile:env
```

`mobile:start`, `mobile:android`, `mobile:ios`, and `mobile:web` run this automatically.

```env
EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
EXPO_PUBLIC_CONVEX_SITE_URL=https://your-deployment.convex.site
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your-google-web-client-id
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=your-google-android-client-id
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your-google-ios-client-id
```

## Required Environment

Frontend `.env.local`:

```env
CONVEX_DEPLOYMENT=your-deployment
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id
```

Convex environment variables:

```env
BETTER_AUTH_SECRET=generate-a-random-secret
SITE_URL=http://localhost:5173
GOOGLE_OAUTH_CLIENT_ID=your-google-web-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-web-client-secret
MOBILE_APP_SCHEME=pravah://
```

## Google OAuth Setup

Use a Google OAuth client of type `Web application`, not `Desktop`.

For local development, configure:

- Authorized JavaScript origin: `http://localhost:5173`
- Authorized redirect URI: `https://your-deployment.convex.site/api/auth/callback/google`
- Authorized redirect URI: `http://localhost:5173/google-callback`

The redirect URIs serve different purposes:

- `/api/auth/callback/google` is for app login via Better Auth
- `/google-callback` is for the separate Google Calendar/Gmail connect flow

## Deploy Checklist

1. Set `SITE_URL` in Convex to your real app domain.
2. Add your production app origin to the Google OAuth client.
3. Add your production Convex callback URI:

```text
https://your-deployment.convex.site/api/auth/callback/google
```

4. Add your production frontend callback URI if you use Google Calendar/Gmail connect:

```text
https://your-app-domain/google-callback
```

## Security Notes

- Never expose `GOOGLE_OAUTH_CLIENT_SECRET` in frontend `VITE_` variables.
- Keep Google client secrets only in Convex env.
- `.env.local` is for local development only.
