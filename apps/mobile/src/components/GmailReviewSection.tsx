import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import { haptic } from "../lib/haptic";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { addDays, nextLaterThisWeek, toIsoDate } from "../lib/dates";
import { mobileLogger, classifyError } from "../lib/logger";

type ReviewItem = Doc<"reviewQueue">;

type Props = {
  enabled: boolean;
  showToast: (next: { kind: "error" | "info"; message: string }) => void;
};

type ScheduleChoice = "today" | "tomorrow" | "laterThisWeek" | "inbox";

function weekdayShort(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: "short" });
}

function scheduleChoices(): { value: ScheduleChoice; label: string }[] {
  const later = nextLaterThisWeek();
  return [
    { value: "today", label: "Today" },
    { value: "tomorrow", label: "Tomorrow" },
    { value: "laterThisWeek", label: `Later, ${weekdayShort(later)}` },
    { value: "inbox", label: "Inbox" },
  ];
}

function scheduleChoiceToDate(choice: ScheduleChoice): string | undefined {
  if (choice === "inbox") return undefined;
  if (choice === "today") return toIsoDate(new Date());
  if (choice === "tomorrow") return toIsoDate(addDays(new Date(), 1));
  return toIsoDate(nextLaterThisWeek());
}

export function GmailReviewSection({ enabled, showToast }: Props) {
  const scheduleOptions = scheduleChoices();
  // Filter server-side so the row cap applies to Gmail items; client-side
  // filtering after take() would let non-Gmail items push Gmail rows out of
  // the response and silently hide pending Gmail work.
  // Fetch the backlog regardless of connection state: already-captured items
  // are local work the user can clear even while Gmail sync is off/disconnected.
  // Connection status and review backlog are independent facts.
  const pendingItems = useQuery(
    api.sync.listReviewQueue,
    { status: "pending", provider: "gmail", limit: 25 }
  );
  const approveReviewItem = useMutation(api.sync.approveReviewItem);
  const rejectReviewItem = useMutation(api.sync.rejectReviewItem);

  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [overrideByItem, setOverrideByItem] = useState<Record<string, ScheduleChoice>>({});
  // Ref-backed in-flight set so the second tap on the same row is blocked
  // synchronously, before React re-renders with the new busy state.
  const inFlightRef = useRef<Set<string>>(new Set());

  const markBusy = useCallback((id: Id<"reviewQueue">, busy: boolean) => {
    if (busy) {
      inFlightRef.current.add(id);
    } else {
      inFlightRef.current.delete(id);
    }
    setBusyIds((prev) => {
      if (busy) return { ...prev, [id]: true };
      const { [id]: _, ...rest } = prev;
      return rest;
    });
  }, []);

  const handleApprove = useCallback(
    async (item: ReviewItem) => {
      if (inFlightRef.current.has(item._id)) return;
      markBusy(item._id, true);
      const choice = overrideByItem[item._id];
      const clearScheduledDate = choice === "inbox";
      const scheduledDate = clearScheduledDate
        ? undefined
        : choice !== undefined
          ? scheduleChoiceToDate(choice)
          : item.scheduledDate;
      try {
        await approveReviewItem({
          reviewId: item._id,
          scheduledDate,
          clearScheduledDate: clearScheduledDate || undefined,
        });
        haptic.success();
        showToast({ kind: "info", message: "Review item approved." });
      } catch (error) {
        mobileLogger.warn("review_approve_failed", { errorType: classifyError(error) });
        showToast({ kind: "error", message: "Could not approve. Try again." });
        haptic.error();
      } finally {
        markBusy(item._id, false);
      }
    },
    [approveReviewItem, markBusy, overrideByItem, showToast]
  );

  const handleReject = useCallback(
    async (item: ReviewItem) => {
      if (inFlightRef.current.has(item._id)) return;
      markBusy(item._id, true);
      try {
        await rejectReviewItem({ reviewId: item._id });
        haptic.light();
        showToast({ kind: "info", message: "Review item rejected." });
      } catch (error) {
        mobileLogger.warn("review_reject_failed", { errorType: classifyError(error) });
        showToast({ kind: "error", message: "Could not reject. Try again." });
        haptic.error();
      } finally {
        markBusy(item._id, false);
      }
    },
    [markBusy, rejectReviewItem, showToast]
  );

  // While still loading or empty, only take up space when sync is enabled.
  // A disconnected user with no backlog sees nothing; one with a backlog still
  // gets the actionable queue below.
  if (pendingItems === undefined) {
    return enabled ? (
      <View style={styles.wrap}>
        <Text style={styles.heading}>Review queue</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.sm }} />
      </View>
    ) : null;
  }

  if (pendingItems.length === 0) {
    return enabled ? (
      <View style={styles.wrap}>
        <Text style={styles.heading}>Review queue</Text>
        <Text style={styles.emptyText}>No pending items.</Text>
      </View>
    ) : null;
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Review queue · {pendingItems.length}</Text>
      <View style={{ gap: spacing.sm }}>
        {pendingItems.map((item) => {
          const choice = overrideByItem[item._id];
          const isBusy = Boolean(busyIds[item._id]);
          return (
            <View key={item._id} style={styles.itemCard}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.description ? (
                <Text style={styles.itemBody} numberOfLines={2}>
                  {item.description}
                </Text>
              ) : null}
              {item.deadline ? (
                <Text style={styles.itemMeta}>Deadline · {item.deadline}</Text>
              ) : null}
              {item.scheduledDate && choice === undefined ? (
                <Text style={styles.itemMeta}>Suggested · {item.scheduledDate}</Text>
              ) : null}

              <View style={styles.chipRow}>
                {scheduleOptions.map((option) => {
                  const active = choice === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      onPress={() =>
                        setOverrideByItem((prev) => ({ ...prev, [item._id]: option.value }))
                      }
                      hitSlop={12}
                      style={({ pressed }) => [
                        styles.chip,
                        active && styles.chipActive,
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => void handleReject(item)}
                  disabled={isBusy}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.secondaryAction,
                    pressed && { opacity: 0.6 },
                    isBusy && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.secondaryActionText}>Reject</Text>
                </Pressable>
                <Pressable
                  onPress={() => void handleApprove(item)}
                  disabled={isBusy}
                  hitSlop={12}
                  style={({ pressed }) => [
                    styles.primaryAction,
                    pressed && { opacity: 0.85 },
                    isBusy && { opacity: 0.5 },
                  ]}
                >
                  <Text style={styles.primaryActionText}>{isBusy ? "Working…" : "Approve"}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  heading: {
    ...typography.micro,
    color: colors.textMuted,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  itemCard: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    padding: spacing.md,
    gap: spacing.xs,
  },
  itemTitle: {
    ...typography.bodyLg,
    color: colors.textPrimary,
  },
  itemBody: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  itemMeta: {
    ...typography.micro,
    color: colors.textMuted,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 44,
    justifyContent: "center",
  },
  chipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.bg,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  secondaryAction: {
    minHeight: 44,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    justifyContent: "center",
  },
  secondaryActionText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  primaryAction: {
    backgroundColor: colors.accent,
    borderRadius: radii.full,
    minHeight: 44,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionText: {
    ...typography.title,
    color: colors.bg,
  },
});
