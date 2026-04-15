# Google OAuth Setup

Pravah uses Google OAuth in two flows:

1. App login via Better Auth (`/api/auth/callback/google`)
2. Google Calendar/Gmail connect via frontend callback (`/google-callback`) and token exchange endpoint (`/google/token`)

Use a single Google OAuth client of type `Web application` for both flows.

## 1) Create OAuth Client

In Google Cloud Console:

1. `APIs & Services` -> `Credentials`
2. `Create Credentials` -> `OAuth client ID`
3. Choose `Web application`
4. Copy client ID + client secret

Do not use `Desktop` client type.

## 2) Configure Redirects

For local dev:

- Authorized JavaScript origin: `http://localhost:5173`
- Authorized redirect URI: `https://<your-deployment>.convex.site/api/auth/callback/google`
- Authorized redirect URI: `http://localhost:5173/google-callback`

For production:

- Authorized JavaScript origin: `https://<your-app-domain>`
- Authorized redirect URI: `https://<your-deployment>.convex.site/api/auth/callback/google`
- Authorized redirect URI: `https://<your-app-domain>/google-callback`

## 3) Enable APIs

Enable in the same Google project:

- Google Calendar API
- Gmail API

## 4) Configure Environment

Root `.env.local`:

```env
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id
```

Convex deployment env:

```env
GOOGLE_OAUTH_CLIENT_ID=your-google-web-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-web-client-secret
SITE_URL=http://localhost:5173
BETTER_AUTH_SECRET=your-random-secret
```

## Troubleshooting

- `redirect_uri_mismatch`
  - Ensure both callback URLs are added in Google Cloud OAuth client.
- Token exchange fails at `/google/token`
  - Check `GOOGLE_OAUTH_CLIENT_ID` in Convex env.
  - Ensure PKCE verifier is present in browser session (retry connect flow).
- Login works but sync connect fails (or vice versa)
  - One callback URI is likely missing.

## Security

- Never expose `GOOGLE_OAUTH_CLIENT_SECRET` in frontend env (`VITE_`).
- Keep secret only in Convex deployment env.
