import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

function toDateString(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return input.includes("T") ? input.slice(0, 10) : input;
}

interface GoogleApiErrorBody {
  error?: {
    code?: number;
    message?: string;
    errors?: Array<{ reason?: string; message?: string }>;
  };
}

interface GoogleCalendarListEntry {
  id?: string;
  summary?: string;
  primary?: boolean;
}

interface GoogleCalendarEventItem {
  id?: string;
  summary?: string;
  description?: string;
  updated?: string;
  status?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

export function buildExternalId(calendarId: string, eventId: string, isPrimaryCalendar = false): string {
  // Backward compatibility: historical primary-calendar mappings used raw event IDs.
  return calendarId === "primary" || isPrimaryCalendar ? eventId : `${calendarId}:${eventId}`;
}

/** Split items into contiguous chunks of at most `size`. Used to bound how many
 *  calendar events a single import mutation processes, keeping each transaction
 *  under Convex's per-execution document-read limit. */
export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunkArray size must be positive");
  const chunks: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size));
  }
  return chunks;
}

export function shouldRetryCalendarWithoutUpdatedMin(status: number, bodyText: string): boolean {
  if (status !== 410) return false;
  try {
    const parsed = JSON.parse(bodyText) as GoogleApiErrorBody;
    const reason = parsed.error?.errors?.[0]?.reason ?? "";
    return reason === "updatedMinTooLongAgo";
  } catch {
    return false;
  }
}

export const listGoogleCalendarsAction = action({
  args: {
    accessToken: v.string(),
  },
  handler: async (_ctx, args): Promise<GoogleCalendarListEntry[]> => {
    const calendars: GoogleCalendarListEntry[] = [];
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        minAccessRole: "reader",
        showDeleted: "false",
        showHidden: "false",
        maxResults: "250",
      });
      if (pageToken) params.set("pageToken", pageToken);

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`,
        {
          headers: {
            Authorization: `Bearer ${args.accessToken}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error(`Calendar list failed: ${await response.text()}`);
      }

      const payload = (await response.json()) as {
        items?: GoogleCalendarListEntry[];
        nextPageToken?: string;
      };

      for (const calendar of payload.items ?? []) {
        if (!calendar.id) continue;
        calendars.push(calendar);
      }
      pageToken = payload.nextPageToken;
    } while (pageToken);

    return calendars;
  },
});

export const importGoogleCalendarAction = action({
  args: {
    accessToken: v.string(),
    tokenExpiresAt: v.optional(v.number()),
    calendarId: v.optional(v.string()),
    calendarIds: v.optional(v.array(v.string())),
    fullResync: v.optional(v.boolean()),
    timeMin: v.optional(v.string()),
    timeMax: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{
    importedCount: number;
    updatedCount: number;
    skippedCount: number;
    maxUpdatedAt?: string;
  }> => {
    const runId = (await ctx.runMutation(api.sync.startSyncRun, {
      provider: "google_calendar",
      direction: "import",
    })) as Id<"syncRuns">;

    try {
      if (args.tokenExpiresAt && args.tokenExpiresAt < Date.now()) {
        throw new Error("Google Calendar token has expired - please reconnect");
      }

      const cursorDoc = await ctx.runQuery(api.sync.getCursor, {
        provider: "google_calendar",
      });
      const shouldUseCursor = !args.fullResync && !args.timeMin;
      class CalendarFetchError extends Error {
        status: number;
        bodyText: string;

        constructor(status: number, bodyText: string) {
          super(bodyText);
          this.status = status;
          this.bodyText = bodyText;
        }
      }

      const listCalendars = async (): Promise<GoogleCalendarListEntry[]> => {
        const calendars: GoogleCalendarListEntry[] = [];
        let pageToken: string | undefined;

        do {
          const params = new URLSearchParams({
            minAccessRole: "reader",
            showDeleted: "false",
            showHidden: "false",
            maxResults: "250",
          });
          if (pageToken) params.set("pageToken", pageToken);

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/users/me/calendarList?${params}`,
            {
              headers: {
                Authorization: `Bearer ${args.accessToken}`,
              },
            }
          );
          if (!response.ok) {
            throw new Error(`Calendar list failed: ${await response.text()}`);
          }

          const payload = (await response.json()) as {
            items?: GoogleCalendarListEntry[];
            nextPageToken?: string;
          };

          for (const calendar of payload.items ?? []) {
            if (!calendar.id) continue;
            calendars.push(calendar);
          }
          pageToken = payload.nextPageToken;
        } while (pageToken);

        return calendars;
      };

      const fetchCalendarEvents = async (
        calendarId: string,
        includeCursor: boolean
      ): Promise<GoogleCalendarEventItem[]> => {
        const events: GoogleCalendarEventItem[] = [];
        let pageToken: string | undefined;

        do {
          const requestParams = new URLSearchParams({
            singleEvents: "true",
            orderBy: "updated",
            showDeleted: "true",
            maxResults: "2500",
          });
          if (args.timeMin) requestParams.set("timeMin", args.timeMin);
          if (args.timeMax) requestParams.set("timeMax", args.timeMax);
          if (includeCursor && shouldUseCursor && cursorDoc?.cursor) {
            requestParams.set("updatedMin", cursorDoc.cursor);
          }
          if (pageToken) requestParams.set("pageToken", pageToken);

          const response = await fetch(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${requestParams}`,
            {
              headers: {
                Authorization: `Bearer ${args.accessToken}`,
              },
            }
          );

          if (!response.ok) {
            throw new CalendarFetchError(response.status, await response.text());
          }

          const payload = (await response.json()) as {
            items?: GoogleCalendarEventItem[];
            nextPageToken?: string;
          };
          events.push(...(payload.items ?? []));
          pageToken = payload.nextPageToken;
        } while (pageToken);

        return events;
      };

      const discoveredCalendars = await listCalendars();
      const discoveredCalendarIds = discoveredCalendars
        .map((calendar) => calendar.id)
        .filter((id): id is string => Boolean(id));
      const primaryCalendarIds = new Set<string>(["primary"]);
      for (const calendar of discoveredCalendars) {
        if (calendar.primary && calendar.id) {
          primaryCalendarIds.add(calendar.id);
        }
      }

      const targetCalendarIds = (
        args.calendarIds && args.calendarIds.length > 0
          ? args.calendarIds
          : args.calendarId
            ? [args.calendarId]
            : discoveredCalendarIds.length > 0
              ? discoveredCalendarIds
              : ["primary"]
      ).filter((id, index, array) => array.indexOf(id) === index);

      const events: Array<{
        externalId: string;
        title: string;
        description?: string;
        scheduledDate?: string;
        deadline?: string;
        externalUpdatedAt?: string;
        cancelled: boolean;
      }> = [];

      for (const calendarId of targetCalendarIds) {
        let rawItems: GoogleCalendarEventItem[] = [];
        try {
          rawItems = await fetchCalendarEvents(calendarId, true);
        } catch (error) {
          const status = error instanceof CalendarFetchError ? error.status : 0;
          const errorText =
            error instanceof CalendarFetchError
              ? error.bodyText
              : error instanceof Error
                ? error.message
                : "";
          if (
            shouldUseCursor &&
            shouldRetryCalendarWithoutUpdatedMin(status, errorText)
          ) {
            rawItems = await fetchCalendarEvents(calendarId, false);
          } else {
            throw new Error(`Calendar import failed: ${errorText}`);
          }
        }

        for (const item of rawItems) {
          if (!item.id) continue;
          const scheduledDate = toDateString(item.start?.date ?? item.start?.dateTime);
          const deadline = toDateString(item.end?.date ?? item.end?.dateTime);
          events.push({
            externalId: buildExternalId(calendarId, item.id, primaryCalendarIds.has(calendarId)),
            title: item.summary?.trim() || "(Untitled calendar event)",
            description: item.description,
            scheduledDate,
            deadline,
            externalUpdatedAt: item.updated,
            cancelled: item.status === "cancelled",
          });
        }
      }

      // Apply events in bounded chunks. A single mutation that imports every
      // event reads 1-3 documents per event, so a large backfill (thousands of
      // events across multiple calendars) exceeds Convex's 32000-document
      // per-transaction read limit and the whole sync fails. Each chunk is its
      // own transaction with its own budget; getNextPosition reads committed
      // state, so task positions stay correct across chunk boundaries.
      const IMPORT_CHUNK_SIZE = 500;
      const result = {
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        maxUpdatedAt: undefined as string | undefined,
      };
      for (const chunk of chunkArray(events, IMPORT_CHUNK_SIZE)) {
        const chunkResult = await ctx.runMutation(api.sync.importGoogleCalendarEvents, {
          runId,
          events: chunk,
        });
        result.importedCount += chunkResult.importedCount;
        result.updatedCount += chunkResult.updatedCount;
        result.skippedCount += chunkResult.skippedCount;
        if (
          chunkResult.maxUpdatedAt &&
          (!result.maxUpdatedAt || chunkResult.maxUpdatedAt > result.maxUpdatedAt)
        ) {
          result.maxUpdatedAt = chunkResult.maxUpdatedAt;
        }
      }

      let postImportError: string | undefined;
      try {
        if (result.maxUpdatedAt) {
          await ctx.runMutation(api.sync.updateSyncCursor, {
            provider: "google_calendar",
            cursor: result.maxUpdatedAt,
          });
        }

        await ctx.runMutation(api.sync.upsertIntegration, {
          provider: "google_calendar",
          status: "connected",
          syncEnabled: true,
          tokenExpiresAt: args.tokenExpiresAt,
          // Clear any prior failure so a recovered sync stops reporting as
          // broken. Without this, a one-time error sticks around forever and
          // the status UI can never return to healthy.
          lastError: undefined,
        });
      } catch (error) {
        postImportError =
          error instanceof Error ? error.message : "Post-import sync update failed";
      }

      await ctx.runMutation(api.sync.completeSyncRun, {
        runId,
        status: "success",
        importedCount: result.importedCount,
        updatedCount: result.updatedCount,
        skippedCount: result.skippedCount,
        errorMessage: postImportError,
      });

      if (postImportError) {
        await ctx.runMutation(api.sync.upsertIntegration, {
          provider: "google_calendar",
          status: "error",
          syncEnabled: true,
          tokenExpiresAt: args.tokenExpiresAt,
          lastError: postImportError,
        });
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error";

      await ctx.runMutation(api.sync.completeSyncRun, {
        runId,
        status: "failed",
        importedCount: 0,
        updatedCount: 0,
        skippedCount: 0,
        errorMessage: message,
      });

      await ctx.runMutation(api.sync.upsertIntegration, {
        provider: "google_calendar",
        status: "error",
        syncEnabled: true,
        lastError: message,
      });

      throw error;
    }
  },
});
