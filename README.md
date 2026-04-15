# Pravah

Pravah is a horizontal timeline task manager with:

- a React web app (`src/`)
- a Convex backend (`convex/`)
- an MCP server for agent integration (`mcp-server.ts`)
- an Expo mobile app (`apps/mobile/`)

## Quick Start

1. Install dependencies

```bash
bun install
```

2. Configure environment variables in root `.env.local`

```env
CONVEX_DEPLOYMENT=your-deployment
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id
```

3. Start Convex dev backend

```bash
bunx convex dev
```

4. Start the web app

```bash
bun run dev
```

## Common Commands

- `bun run dev` - start web app
- `bun run build` - type-check and build web app
- `bun run lint` - run ESLint
- `bun run test:run` - run Vitest suite
- `bun run mcp` - run MCP server over stdio
- `bun run mobile:start` - start Expo mobile app
- `bun run mobile:android` - Android native run (auto syncs env)
- `bun run mobile:ios` - iOS native run (auto syncs env)
- `bun run mobile:web` - Expo web run

## Project Structure

- `src/` - React web client and UI logic
- `convex/` - Convex schema, queries, mutations, actions, and HTTP routes
- `apps/mobile/` - Expo React Native app
- `scripts/` - local tooling (`mobile:env`, Android runtime helpers)
- `mcp-server.ts` - MCP bridge exposing task/sync tools
- `docs/` - maintained technical documentation

## Environment

### Root `.env.local` (web + shared)

```env
CONVEX_DEPLOYMENT=your-deployment
VITE_CONVEX_URL=https://your-deployment.convex.cloud
VITE_CONVEX_SITE_URL=https://your-deployment.convex.site
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id
```

### Convex deployment env

```env
BETTER_AUTH_SECRET=generate-a-random-secret
SITE_URL=http://localhost:5173
GOOGLE_OAUTH_CLIENT_ID=your-google-web-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-web-client-secret
MOBILE_APP_SCHEME=pravah://
CONVEX_HTTP_API_KEY=your-http-api-key
```

### Mobile env sync

Generate `apps/mobile/.env.local` from root env:

```bash
bun run mobile:env
```

`mobile:start`, `mobile:android`, `mobile:ios`, and `mobile:web` run this automatically.

## Documentation Map

- `docs/development.md` - local setup, environment, and workflows
- `docs/api.md` - HTTP routes and MCP tools
- `docs/google-oauth.md` - Google OAuth setup and troubleshooting
- `docs/architecture.md` - system architecture and module map
- `docs/codebase-review-2026-04-15.md` - current code health review and improvements

## Security Notes

- Never expose `GOOGLE_OAUTH_CLIENT_SECRET` via `VITE_` variables.
- Keep secrets only in deployment/server env.
- Do not commit `.env.local` or real credentials.
