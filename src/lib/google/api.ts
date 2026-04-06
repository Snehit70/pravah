import type { GoogleCalendarEvent, CalendarSyncConfig, GmailSyncConfig } from "./types";

export function getGoogleOAuthUrl(): string {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const redirectUri = `${window.location.origin}/google-callback`;
  const scope = encodeURIComponent(
    "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.readonly"
  );
  
  return `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=${scope}&prompt=consent`;
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
): Promise<any[]> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?query=${encodeURIComponent(query)}&maxResults=${maxResults}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch gmail messages: ${response.statusText}`);
  }
  
  const data = await response.json();
  return data.messages || [];
}

export async function getGmailMessage(
  accessToken: string,
  messageId: string
): Promise<any> {
  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch gmail message: ${response.statusText}`);
  }
  
  return response.json();
}

export async function getGmailLabels(accessToken: string): Promise<any[]> {
  const response = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/labels",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  
  if (!response.ok) {
    throw new Error(`Failed to fetch gmail labels: ${response.statusText}`);
  }
  
  const data = await response.json();
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
