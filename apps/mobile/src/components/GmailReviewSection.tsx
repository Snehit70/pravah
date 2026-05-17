import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import { api } from "../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { addDays, toIsoDate } from "../lib/dates";
import { mobileLogger, classifyError } from "../lib/logger";

type ReviewItem = Doc<"reviewQueue">;

type Props = {
  enabled: boolean;
  showToast: (next: { kind: "error" | "info"; message: string }) => void;
};

type ScheduleChoice = "today" | "tomorrow" | "nextweek" | "inbox";

const SCHEDULE_CHOICES: { value: ScheduleChoice; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "tomorrow", label: "Tomorrow" },
  { value: "nextweek", label: "+1w" },
  { value: "inbox", label: "Inbox" },
];

function scheduleChoiceToDate(choice: ScheduleChoice): string | undefined {
  if (choice === "inbox") return undefined;
  if (choice === "today") return toIsoDate(new Date());
  if (choice === "tomorrow") return toIsoDate(addDays(new Date(), 1));
  return toIsoDate(addDays(new Date(), 7));
}

export function GmailReviewSection({ enabled, showToast }: Props) {
  const pendingItems = useQuery(
    api.sync.listReviewQueue,
    enabled ? { status: "pending", limit: 25 } : "skip"
  );
  const approveReviewItem = useMutation(api.sync.approveReviewItem);
  const rejectReviewItem = useMutation(api.sync.rejectReviewItem);

  const [busyId, setBusyId] = useState<Id<"reviewQueue"> | null>(null);
  const [overrideByItem, setOverrideByItem] = useState<Record<string, ScheduleChoice>>({});

  const handleApprove = useCallback(
    async (item: ReviewItem) => {
      setBusyId(item._id);
      const choice = overrideByItem[item._id];
      const scheduledDate =
        choice !== undefined ? scheduleChoiceToDate(choice) : item.scheduledDate;
      try {
        await approveReviewItem({ reviewId: item._id, scheduledDate });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        showToast({ kind: "info", message: "Review item approved." });
      } catch (error) {
        mobileLogger.warn("review_approve_failed", { errorType: classifyError(error) });
        showToast({ kind: "error", message: "Could not approve. Try again." });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setBusyId(null);
      }
    },
    [approveReviewItem, overrideByItem, showToast]
  );

  const handleReject = useCallback(
    async (item: ReviewItem) => {
      setBusyId(item._id);
      try {
        await rejectReviewItem({ reviewId: item._id });
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        showToast({ kind: "info", message: "Review item rejected." });
      } catch (error) {
        mobileLogger.warn("review_reject_failed", { errorType: classifyError(error) });
        showToast({ kind: "error", message: "Could not reject. Try again." });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      } finally {
        setBusyId(null);
      }
    },
    [rejectReviewItem, showToast]
  );

  if (!enabled) {
    return null;
  }

  if (pendingItems === undefined) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.heading}>Review queue</Text>
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.sm }} />
      </View>
    );
  }

  if (pendingItems.length === 0) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.heading}>Review queue</Text>
        <Text style={styles.emptyText}>No pending items.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Review queue · {pendingItems.length}</Text>
      <View style={{ gap: spacing.sm }}>
        {pendingItems.map((item) => {
          const choice = overrideByItem[item._id];
          const isBusy = busyId === item._id;
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
                {SCHEDULE_CHOICES.map((option) => {
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
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    minHeight: 28,
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
