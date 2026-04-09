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

export const importGoogleCalendarAction = action({
  args: {
    accessToken: v.string(),
    tokenExpiresAt: v.optional(v.number()),
    calendarId: v.optional(v.string()),
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

      const params = new URLSearchParams({
        singleEvents: "true",
        orderBy: "updated",
      });
      if (args.timeMin) params.set("timeMin", args.timeMin);
      if (args.timeMax) params.set("timeMax", args.timeMax);
      if (!args.timeMin && cursorDoc?.cursor) params.set("updatedMin", cursorDoc.cursor);

      const calendarId = args.calendarId ?? "primary";
      const fetchEvents = async (includeCursor: boolean) => {
        const requestParams = new URLSearchParams(params);
        if (!includeCursor) {
          requestParams.delete("updatedMin");
        }

        return await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${requestParams}`,
          {
            headers: {
              Authorization: `Bearer ${args.accessToken}`,
            },
          }
        );
      };

      let response = await fetchEvents(true);
      if (!response.ok) {
        const errorText = await response.text();
        if (params.has("updatedMin") && shouldRetryCalendarWithoutUpdatedMin(response.status, errorText)) {
          response = await fetchEvents(false);
          if (!response.ok) {
            const retryErrorText = await response.text();
            throw new Error(`Calendar import failed: ${retryErrorText}`);
          }
        } else {
          throw new Error(`Calendar import failed: ${errorText}`);
        }
      }

      const payload = (await response.json()) as {
        items?: Array<{
          id?: string;
          summary?: string;
          description?: string;
          updated?: string;
          status?: string;
          start?: { date?: string; dateTime?: string };
          end?: { date?: string; dateTime?: string };
        }>;
      };

      const events = (payload.items ?? [])
        .filter((item) => !!item.id)
        .map((item) => {
          const scheduledDate = toDateString(item.start?.date ?? item.start?.dateTime);
          const deadline = toDateString(item.end?.date ?? item.end?.dateTime);
          return {
            externalId: item.id!,
            title: item.summary?.trim() || "(Untitled calendar event)",
            description: item.description,
            scheduledDate,
            deadline,
            externalUpdatedAt: item.updated,
            cancelled: item.status === "cancelled",
          };
        });

      const result = await ctx.runMutation(api.sync.importGoogleCalendarEvents, {
        runId,
        events,
      });

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
