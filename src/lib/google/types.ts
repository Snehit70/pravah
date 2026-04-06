export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description?: string;
  start: { dateTime?: string; date?: string };
  end: { dateTime?: string; date?: string };
  due?: string;
  status?: string;
  htmlLink?: string;
}

export interface GoogleGmailMessage {
  id: string;
  threadId: string;
  subject?: string;
  snippet?: string;
  from?: string;
  date?: string;
}

export interface CalendarSyncConfig {
  enabled: boolean;
  calendarId: string;
  syncDirection: "both" | "to-pravah" | "from-pravah";
  autoSync: boolean;
}

export interface GmailSyncConfig {
  enabled: boolean;
  syncEmailsWithLabel?: string;
  createTasksFromEmails: boolean;
}

export interface GoogleIntegrationState {
  connected: boolean;
  email?: string;
  calendars?: CalendarSyncConfig;
  gmail?: GmailSyncConfig;
  lastSync?: number;
}