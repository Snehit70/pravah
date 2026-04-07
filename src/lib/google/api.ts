import type { GoogleCalendarEvent, GoogleGmailMessage } from "./types";

interface GoogleListResponse<T> {
  messages?: T[];
  labels?: T[];
}

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  token_type?: string;
  scope?: string;
}

const GOOGLE_CODE_VERIFIER_KEY = "pravah_google_pkce_verifier";

function base64UrlEncode(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomString(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues, (value) => alphabet[value % alphabet.length]).join("");
}

async function createPkceChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return base64UrlEncode(new Uint8Array(digest));
}

export async function getGoogleOAuthUrl(): Promise<string> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = `${window.location.origin}/google-callback`;
  const scope = encodeURIComponent(
    "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.readonly"
  );

  const codeVerifier = randomString(96);
  sessionStorage.setItem(GOOGLE_CODE_VERIFIER_KEY, codeVerifier);
  const codeChallenge = await createPkceChallenge(codeVerifier);
  
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}&prompt=consent&access_type=offline&code_challenge=${codeChallenge}&code_challenge_method=S256`;
}

export async function exchangeGoogleAuthCode(code: string): Promise<{ accessToken: string; expiresIn: number }> {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = import.meta.env.VITE_GOOGLE_CLIENT_SECRET as string | undefined;
  const redirectUri = `${window.location.origin}/google-callback`;
  const codeVerifier = sessionStorage.getItem(GOOGLE_CODE_VERIFIER_KEY);

  if (!codeVerifier) {
    throw new Error("Missing PKCE verifier. Please retry Google sign-in.");
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier,
  });

  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Google token exchange failed: ${response.status} ${errorText}`);
  }

  const tokenData = (await response.json()) as GoogleTokenResponse;
  sessionStorage.removeItem(GOOGLE_CODE_VERIFIER_KEY);

  return {
    accessToken: tokenData.access_token,
    expiresIn: tokenData.expires_in,
  };
}

export async function fetchCalendarEvents(
  accessToken: string,
  calendarId: string = "primary",
  timeMin?: string,
  timeMax?: string
): Promise<GoogleCalendarEvent[]> {
  const params = new URLSearchParams({
    singleEvents: "true",
    orderBy: "startTime",
  });
  
  if (timeMin) params.set("timeMin", timeMin);
  if (timeMax) params.set("timeMax", timeMax);
  
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch calendar events: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.items || [];
}

export async function createCalendarEvent(
  accessToken: string,
  calendarId: string = "primary",
  event: Partial<GoogleCalendarEvent>
): Promise<GoogleCalendarEvent> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to create calendar event: ${response.statusText}`);
  }
  
  return response.json();
}

export async function updateCalendarEvent(
  accessToken: string,
  calendarId: string = "primary",
  eventId: string,
  event: Partial<GoogleCalendarEvent>
): Promise<GoogleCalendarEvent> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to update calendar event: ${response.statusText}`);
  }
  
  return response.json();
}

export async function deleteCalendarEvent(
  accessToken: string,
  calendarId: string = "primary",
  eventId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${eventId}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to delete calendar event: ${response.statusText}`);
  }
}

export async function fetchGmailMessages(
  accessToken: string,
  query: string = "is:unread",
  maxResults: number = 10
): Promise<GoogleGmailMessage[]> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?query=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch gmail messages: ${response.statusText}`);
  }
  
  const data = (await response.json()) as GoogleListResponse<GoogleGmailMessage>;
  return data.messages || [];
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<GoogleGmailMessage> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch gmail message: ${response.statusText}`);
  }
  
  return (await response.json()) as GoogleGmailMessage;
}

export async function getGmailLabels(accessToken: string): Promise<{ id: string; name: string }[]> {
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch gmail labels: ${response.statusText}`);
  }
  
  const data = (await response.json()) as GoogleListResponse<{ id: string; name: string }>;
  return data.labels || [];
}

export function parseGoogleTokens(hash: string): { accessToken: string; expiresIn: number } | null {
  const params = new URLSearchParams(hash.substring(1));
  const accessToken = params.get("access_token");
  const expiresIn = params.get("expires_in");
  
  if (!accessToken) return null;
  
  return {
    accessToken,
    expiresIn: expiresIn ? parseInt(expiresIn) : 3600,
  };
}

export function saveGoogleTokens(accessToken: string, expiresIn: number): void {
  const expiry = Date.now() + expiresIn * 1000;
  localStorage.setItem("pravah_google_token", accessToken);
  localStorage.setItem("pravah_google_token_expiry", expiry.toString());
}

export function getGoogleTokens(): { accessToken: string; expired: boolean } | null {
  const accessToken = localStorage.getItem("pravah_google_token");
  const expiryStr = localStorage.getItem("pravah_google_token_expiry");
  
  if (!accessToken) return null;
  
  const expired = expiryStr ? Date.now() > parseInt(expiryStr) : true;
  
  return { accessToken, expired };
}

export function clearGoogleTokens(): void {
  localStorage.removeItem("pravah_google_token");
  localStorage.removeItem("pravah_google_token_expiry");
}
