import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

function toDateString(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return input.includes("T") ? input.slice(0, 10) : input;
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
      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
        {
          headers: {
            Authorization: `Bearer ${args.accessToken}`,
          },
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Calendar import failed: ${errorText}`);
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
