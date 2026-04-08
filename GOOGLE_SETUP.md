# Google Integration Setup Guide

## Prerequisites

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing project

## Enable APIs

1. Go to **APIs & Services** > **Library**
2. Search and enable:
   - **Google Calendar API**
   - **Gmail API**

## Create OAuth Credentials

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. Configure OAuth consent screen:
   - User Type: **External**
   - Fill in required fields (app name, email)
4. Application type: **Web application**
5. Add authorized redirect URI: `http://localhost:5173/google-callback`
6. Copy **Client ID** and **Client Secret**

## Create Service Account (for server-side)

1. Go to **Credentials** > **Create Credentials** > **Service Account**
2. Name: `pravah-integration`
3. Role: **Project > Viewer**
4. Create key (JSON) - download and keep secure

## Environment Variables

Add to `.env.local`:

```env
# Google OAuth (client-side)
VITE_GOOGLE_CLIENT_ID=your-client-id

# Google Service Account (server-side)
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=your-private-key
GOOGLE_PROJECT_ID=your-project-id
```

## Quick Setup (For Testing)

If you just want to test without full OAuth:

1. Use the Gmail/Google Calendar APIs with API keys
2. Or use the Google APIs Explorer for manual testing

## Code Structure

```
src/
├── lib/
│   ├── google/
│   │   ├── calendar.ts    - Calendar API client
│   │   ├── gmail.ts       - Gmail API client
│   │   ├── auth.ts        - OAuth handling
│   │   └── types.ts       - Type definitions
```

## Security Notes

- Never commit credentials to git
- Store private keys in environment variables
- Use OAuth 2.0 for user data
- Service account for server-side operations only
