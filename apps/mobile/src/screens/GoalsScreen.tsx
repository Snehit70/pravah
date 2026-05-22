/**
 * GoalsScreen
 *
 * Mobile parity with web LongTermGoalsPage: a local list of long-horizon
 * goals persisted to AsyncStorage. Mobile-only addition: each goal can have
 * tasks linked to it via goalLinksStore (also local). The screen surfaces
 * "X of Y done" + a thin progress bar per goal and expands to show the
 * linked tasks inline.
 *
 * Reordering by drag is intentionally absent: react-native-draggable-flatlist
 * is currently incompatible with Reanimated 4 in this app (see InboxScreen
 * comment). Delete-and-readd is the manual reorder path until that's fixed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";

import { haptic } from "../lib/haptic";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { goalsStore, type GoalItem } from "../lib/goalsStorage";
import { goalLinksStore } from "../lib/goalLinks";
import { useGoals, useGoalLinks } from "../hooks/useGoals";
import { useConfirm } from "../hooks/useConfirm";
import type { MobileTask } from "../components/TaskCard";

const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatDeadline(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const month = SHORT_MONTHS[Number(m[2]) - 1] ?? m[2];
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

type DeadlineStatus = "overdue" | "soon" | "normal";
function deadlineStatus(iso: string): DeadlineStatus {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "normal";
  const deadline = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (deadline.getTime() - today.getTime()) / 86400000;
  if (diffDays < 0) return "overdue";
  if (diffDays <= 7) return "soon";
  return "normal";
}

const PRIORITY_RANK: Record<string, number> = { p1: 0, p2: 1, p3: 2 };

const PRIORITY_LABEL: Record<"p1" | "p2" | "p3", { label: string; color: string }> = {
  p1: { label: "P1", color: "#e87a90" },
  p2: { label: "P2", color: "#d3a04b" },
  p3: { label: "P3", color: "#4ec9b0" },
};

function GoalProgressBar({
  ratio,
  isComplete,
  isLoading,
}: {
  ratio: number;
  isComplete: boolean;
  isLoading?: boolean;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(ratio, {
      duration: 600,
      easing: Easing.out(Easing.cubic),
    });
  }, [ratio, progress]);
  const fillStyle = useAnimatedStyle(() => ({
    width: `${(isLoading ? 0.3 : progress.value) * 100}%`,
  }));
  return (
    <View style={styles.progressTrack}>
      <Animated.View
        style={[
          styles.progressFill,
          isLoading && styles.progressFillLoading,
          isComplete && styles.progressFillComplete,
          fillStyle,
        ]}
      />
    </View>
  );
}

type GoalDetailSheetProps = {
  goal: GoalItem | null;
  progress: GoalProgress;
  linked: MobileTask[];
  onDelete: () => void;
  onClose: () => void;
};

function GoalDetailSheet({ goal, progress, linked, onDelete, onClose }: GoalDetailSheetProps) {
  const hasTasks = progress.total > 0;
  const isComplete = hasTasks && progress.done === progress.total;

  return (
    <Modal
      visible={goal !== null}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={detailStyles.backdrop}>
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, detailStyles.backdropDim]} />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {goal ? (
          <Animated.View entering={FadeIn.duration(140)} style={detailStyles.card}>
            {/* Header */}
            <View style={detailStyles.header}>
              <Text style={detailStyles.title} numberOfLines={3}>{goal.text}</Text>
              <Pressable onPress={onClose} hitSlop={12} style={({ pressed }) => [detailStyles.closeBtn, pressed && { opacity: 0.6 }]}>
                <Text style={detailStyles.closeBtnText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              style={detailStyles.scrollArea}
              contentContainerStyle={detailStyles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Description */}
              {goal.description ? (
                <Text style={detailStyles.description}>{goal.description}</Text>
              ) : null}

              {/* Meta: priority + deadline */}
              {(goal.priority || goal.deadline) ? (
                <View style={detailStyles.metaRow}>
                  {goal.priority ? (
                    <View style={detailStyles.priorityChip}>
                      <View style={[detailStyles.priorityDot, { backgroundColor: PRIORITY_LABEL[goal.priority].color }]} />
                      <Text style={[detailStyles.priorityText, { color: PRIORITY_LABEL[goal.priority].color }]}>
                        {PRIORITY_LABEL[goal.priority].label}
                      </Text>
                    </View>
                  ) : null}
                  {goal.deadline ? (() => {
                    const ds = deadlineStatus(goal.deadline);
                    const dlColor = ds === "overdue" ? colors.error : ds === "soon" ? "#d3a04b" : colors.textMuted;
                    return (
                      <Text style={[detailStyles.metaText, { color: dlColor }]}>
                        {ds === "overdue" ? `Overdue · ${formatDeadline(goal.deadline)}` : formatDeadline(goal.deadline)}
                      </Text>
                    );
                  })() : null}
                </View>
              ) : null}

              {/* Progress */}
              <View style={detailStyles.progressSection}>
                <View style={detailStyles.progressHeader}>
                  <Text style={detailStyles.progressLabel}>Progress</Text>
                  <Text style={detailStyles.progressCount}>
                    {hasTasks ? `${progress.done} of ${progress.total} done` : "No tasks linked"}
                  </Text>
                </View>
                <GoalProgressBar ratio={progress.ratio} isComplete={isComplete} />
              </View>

              {/* Linked tasks */}
              <View style={detailStyles.tasksSection}>
                <Text style={detailStyles.sectionLabel}>Linked tasks</Text>
                {hasTasks ? linked.map((t) => {
                  const done = t.status === "completed";
                  return (
                    <View key={String(t._id)} style={detailStyles.taskRow}>
                      <View style={[detailStyles.taskDot, done ? detailStyles.taskDotDone : detailStyles.taskDotOpen]} />
                      <Text style={[detailStyles.taskTitle, done && detailStyles.taskTitleDone]} numberOfLines={2}>
                        {t.title}
                      </Text>
                      <Pressable
                        onPress={() => { goalLinksStore.setLink(String(t._id), null); haptic.light(); }}
                        hitSlop={8}
                        style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                      >
                        <Text style={detailStyles.unlinkText}>Unlink</Text>
                      </Pressable>
                    </View>
                  );
                }) : (
                  <Text style={detailStyles.noTasksHint}>
                    Open Capture, pick a goal while adding a task to link it here.
                  </Text>
                )}
              </View>

              {/* Delete */}
              <Pressable
                onPress={onDelete}
                style={({ pressed }) => [detailStyles.deleteBtn, pressed && { opacity: 0.8 }]}
              >
                <Text style={detailStyles.deleteBtnText}>Delete goal</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}

type GoalsScreenProps = {
  tabBarHeight: number;
  tasks: MobileTask[];
  isTaskDataLoading?: boolean;
};

type GoalProgress = {
  total: number;
  done: number;
  ratio: number;
};

export function GoalsScreen({ tabBarHeight, tasks, isTaskDataLoading = false }: GoalsScreenProps) {
  const confirm = useConfirm();
  const { goals, isHydrated } = useGoals();
  const links = useGoalLinks();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  // Map goalId -> linked MobileTask[] (newest first), filtered by current
  // task list so orphan links (task deleted) silently drop out.
  const tasksByGoal = useMemo(() => {
    const out = new Map<string, MobileTask[]>();
    const taskById = new Map(tasks.map((t) => [String(t._id), t]));
    for (const [taskId, goalId] of Object.entries(links)) {
      const t = taskById.get(taskId);
      if (!t) continue;
      const list = out.get(goalId) ?? [];
      list.push(t);
      out.set(goalId, list);
    }
    for (const list of out.values()) {
      list.sort((a, b) => b.updatedAt - a.updatedAt);
    }
    return out;
  }, [tasks, links]);

  const sortedGoals = useMemo(() => {
    return [...goals].sort((a, b) => {
      const pr = (PRIORITY_RANK[a.priority ?? ""] ?? 3) - (PRIORITY_RANK[b.priority ?? ""] ?? 3);
      if (pr !== 0) return pr;
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
  }, [goals]);

  const progressByGoal = useMemo(() => {
    const out = new Map<string, GoalProgress>();
    for (const g of goals) {
      const list = tasksByGoal.get(g.id) ?? [];
      const total = list.length;
      const done = list.filter((t) => t.status === "completed").length;
      const ratio = total === 0 ? 0 : done / total;
      out.set(g.id, { total, done, ratio });
    }
    return out;
  }, [goals, tasksByGoal]);

  const handleDelete = useCallback(
    async (goal: GoalItem) => {
      const linkedCount = tasksByGoal.get(goal.id)?.length ?? 0;
      const ok = await confirm({
        title: "Delete goal?",
        message:
          linkedCount > 0
            ? `${goal.text}\n\n${linkedCount} linked ${linkedCount === 1 ? "task" : "tasks"} will be unlinked but kept.`
            : goal.text,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
      goalLinksStore.clearGoal(goal.id);
      goalsStore.remove(goal.id);
      setSelectedGoalId(null);
      haptic.success();
    },
    [confirm, tasksByGoal],
  );

  const emptyBlock = (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>No goals yet.</Text>
      <Text style={styles.emptyText}>
        Tap + Capture and switch to "New goal" to add a long-horizon goal. New
        tasks can be linked to a goal from the same sheet.
      </Text>
    </Animated.View>
  );

  const footerHint = (
    <Text style={styles.footerHint}>Private to this device. Goals don't sync.</Text>
  );

  const selectedGoal = sortedGoals.find((g) => g.id === selectedGoalId) ?? null;
  const selectedProgress = selectedGoal
    ? (progressByGoal.get(selectedGoal.id) ?? { total: 0, done: 0, ratio: 0 })
    : { total: 0, done: 0, ratio: 0 };
  const selectedLinked = selectedGoal ? (tasksByGoal.get(selectedGoal.id) ?? []) : [];

  return (
    <View style={{ flex: 1 }}>
      <FlatList<GoalItem>
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: spacing.md,
          paddingBottom: tabBarHeight + 84,
        }}
        data={sortedGoals}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={
          sortedGoals.length > 0 ? (
            <Text style={styles.sectionMeta}>{`${sortedGoals.length} active`}</Text>
          ) : null
        }
        ListEmptyComponent={isHydrated ? emptyBlock : null}
        ListFooterComponent={sortedGoals.length > 0 ? footerHint : null}
        renderItem={({ item, index }) => {
          const progress = progressByGoal.get(item.id) ?? { total: 0, done: 0, ratio: 0 };
          const hasTasks = progress.total > 0;
          const showLinkedLoading = isTaskDataLoading && !hasTasks;
          const isComplete = hasTasks && progress.done === progress.total;
          return (
            <Animated.View entering={FadeInDown.duration(280).delay(index * 50)}>
              <Pressable
                onPress={() => { setSelectedGoalId(item.id); haptic.light(); }}
                onLongPress={() => void handleDelete(item)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Goal: ${item.text}. Long-press to delete.`}
                style={({ pressed }) => [
                  styles.goalCard,
                  isComplete && styles.goalCardComplete,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={styles.goalTap}>
                  <View style={styles.goalHead}>
                    <Text style={styles.goalText} numberOfLines={2}>{item.text}</Text>
                    <Text style={styles.goalCount}>
                      {showLinkedLoading ? "…" : hasTasks ? `${progress.done}/${progress.total}` : "—"}
                    </Text>
                  </View>

                  {item.description ? (
                    <Text style={styles.goalDesc} numberOfLines={2}>{item.description}</Text>
                  ) : null}

                  <GoalProgressBar
                    ratio={progress.ratio}
                    isComplete={isComplete}
                    isLoading={showLinkedLoading}
                  />

                  <View style={styles.goalMetaRow}>
                    <View style={styles.goalMetaLeft}>
                      {item.priority ? (
                        <View style={styles.priorityChip}>
                          <View style={[styles.priorityDot, { backgroundColor: PRIORITY_LABEL[item.priority].color }]} />
                          <Text style={styles.priorityText}>{PRIORITY_LABEL[item.priority].label}</Text>
                        </View>
                      ) : null}
                      {item.deadline ? (() => {
                        const ds = deadlineStatus(item.deadline);
                        const dlColor = ds === "overdue" ? colors.error : ds === "soon" ? "#d3a04b" : undefined;
                        return (
                          <Text style={[styles.goalMeta, dlColor ? { color: dlColor } : null]}>
                            {ds === "overdue" ? `Overdue · ${formatDeadline(item.deadline)}` : formatDeadline(item.deadline)}
                          </Text>
                        );
                      })() : null}
                      <Text style={styles.goalMeta}>
                        {showLinkedLoading
                          ? "Loading linked tasks..."
                          : hasTasks
                          ? isComplete
                            ? "All done"
                            : `${progress.total - progress.done} open`
                          : "No tasks linked"}
                      </Text>
                    </View>
                    <Text style={styles.goalChevron}>›</Text>
                  </View>
                </View>
              </Pressable>
            </Animated.View>
          );
        }}
        showsVerticalScrollIndicator={false}
      />
      <GoalDetailSheet
        goal={selectedGoal}
        progress={selectedProgress}
        linked={selectedLinked}
        onDelete={() => selectedGoal && void handleDelete(selectedGoal)}
        onClose={() => setSelectedGoalId(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionMeta: {
    ...typography.micro,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  goalCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    overflow: "hidden",
  },
  goalCardComplete: {
    borderColor: colors.success,
  },
  goalTap: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  goalHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  goalText: {
    flex: 1,
    ...typography.bodyLg,
    color: colors.textPrimary,
  },
  goalCount: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  goalDesc: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.bgCardGlass,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accent,
  },
  progressFillComplete: {
    backgroundColor: colors.success,
  },
  progressFillLoading: {
    opacity: 0.45,
  },
  goalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  goalMetaLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    columnGap: spacing.sm,
    rowGap: spacing.xs / 2,
  },
  priorityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  priorityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  priorityText: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  goalMeta: {
    ...typography.micro,
    color: colors.textMuted,
  },
  goalChevron: {
    ...typography.bodyLg,
    color: colors.textMuted,
    lineHeight: 20,
  },
  emptyWrap: {
    paddingTop: spacing.section,
    paddingHorizontal: spacing.xxl,
    gap: spacing.sm,
    alignItems: "center",
  },
  emptyTitle: {
    ...typography.headline,
    color: colors.textPrimary,
    textAlign: "center",
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    textAlign: "center",
  },
  footerHint: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
    paddingTop: spacing.md,
  },
});

const detailStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  backdropDim: {
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    backgroundColor: colors.bg,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  scrollArea: {
    flexShrink: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    flex: 1,
    ...typography.headline,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  closeBtnText: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: "600",
  },
  description: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  priorityChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.bgCard,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radii.sm,
  },
  priorityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  priorityText: {
    ...typography.micro,
    fontWeight: "700",
  },
  metaText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  progressSection: {
    gap: spacing.sm,
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  progressCount: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: "600",
  },
  tasksSection: {
    gap: spacing.sm,
  },
  sectionLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  taskDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  taskDotDone: { backgroundColor: colors.success },
  taskDotOpen: { backgroundColor: colors.border },
  taskTitle: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  taskTitleDone: {
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  unlinkText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  noTasksHint: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  deleteBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error,
    alignItems: "center",
  },
  deleteBtnText: {
    ...typography.bodyMd,
    color: colors.error,
    fontWeight: "600",
  },
});
