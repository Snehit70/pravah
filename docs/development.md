# Development Guide

This guide covers local setup and day-to-day workflows for Pravah.

## Prerequisites

- Bun 1.x
- Node.js 20+ (for ecosystem compatibility)
- Convex CLI (`bunx convex ...`)
- Optional for mobile:
  - Android Studio + Android SDK
  - JDK 21 (or compatible JDK)
  - Xcode for iOS development

## First-Time Setup

1. Install dependencies:

```bash
bun install
```

2. Create root `.env.local`:

```env
CONVEX_DEPLOYMENT=your-deployment
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id
```

3. Start Convex dev backend:

```bash
bunx convex dev
```

4. Start web app:

```bash
bun run dev
```

## Web Development

- Run lint:

```bash
bun run lint
```

- Run tests:

```bash
bun run test:run
```

- Build for production:

```bash
bun run build
```

## Mobile Development

### Start Expo app

```bash
bun run mobile:start
```

### Android

```bash
bun run mobile:android
```

`scripts/run-mobile-android.mjs` auto-detects common Android SDK paths and a compatible JDK if env vars are missing.

### iOS

```bash
bun run mobile:ios
```

### Expo web

```bash
bun run mobile:web
```

### Mobile environment sync

Generate `apps/mobile/.env.local` from root env:

```bash
bun run mobile:env
```

Auto-run by: `mobile:start`, `mobile:android`, `mobile:ios`, `mobile:web`.

## Convex Environment

Set these in Convex deployment env:

```env
BETTER_AUTH_SECRET=generate-a-random-secret
SITE_URL=http://localhost:5173
GOOGLE_OAUTH_CLIENT_ID=your-google-web-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-web-client-secret
MOBILE_APP_SCHEME=pravah://
CONVEX_HTTP_API_KEY=your-http-api-key
```

## Useful Paths

- `src/` - web app
- `convex/` - backend logic + HTTP routes
- `apps/mobile/` - Expo app
- `src/test/` - web/backend unit and integration tests
- `apps/mobile/DEBUGGING.md` - mobile log capture/troubleshooting
