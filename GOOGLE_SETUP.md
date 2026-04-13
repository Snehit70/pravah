# Google Setup

Pravah uses Google in two separate ways:

1. Google OAuth login for signing into the app
2. Google Calendar/Gmail connection for syncing data

Both should use the same Google OAuth client, and that client must be a `Web application`.

## Create The Correct OAuth Client

1. Open Google Cloud Console
2. Go to `APIs & Services` -> `Credentials`
3. Click `Create Credentials` -> `OAuth client ID`
4. Choose `Web application`
5. Copy the new client ID and client secret

Do not use a `Desktop` client.

## Configure Redirects

For local development add:

- Authorized JavaScript origin: `http://localhost:5173`
- Authorized redirect URI: `https://befitting-swan-125.eu-west-1.convex.site/api/auth/callback/google`
- Authorized redirect URI: `http://localhost:5173/google-callback`

For production add:

- Authorized JavaScript origin: `https://your-app-domain`
- Authorized redirect URI: `https://befitting-swan-125.eu-west-1.convex.site/api/auth/callback/google`
- Authorized redirect URI: `https://your-app-domain/google-callback`

## Enable APIs

Enable these Google APIs in the same project:

- Google Calendar API
- Gmail API

## Frontend Environment

In `.env.local`:

```env
VITE_GOOGLE_CLIENT_ID=your-google-web-client-id
```

## Convex Environment

Set these in Convex:

```env
BETTER_AUTH_SECRET=your-random-secret
SITE_URL=http://localhost:5173
GOOGLE_OAUTH_CLIENT_ID=your-google-web-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-web-client-secret
```

When you deploy, change `SITE_URL` to your production domain.

## Important Distinction

- Better Auth login callback: `/api/auth/callback/google`
- Google sync callback: `/google-callback`

If one works and the other fails, it usually means only one redirect URI was added in Google Cloud.
