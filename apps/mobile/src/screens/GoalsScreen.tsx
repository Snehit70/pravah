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

import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { goalsStore, type GoalItem } from "../lib/goalsStorage";
import { goalLinksStore } from "../lib/goalLinks";
import { useGoals, useGoalLinks } from "../hooks/useGoals";
import { useConfirm } from "../hooks/useConfirm";
import type { MobileTask } from "../components/TaskCard";

type GoalsScreenProps = {
  tabBarHeight: number;
  tasks: MobileTask[];
};

type GoalProgress = {
  total: number;
  done: number;
  ratio: number;
};

export function GoalsScreen({ tabBarHeight, tasks }: GoalsScreenProps) {
  const confirm = useConfirm();
  const { goals, isHydrated } = useGoals();
  const links = useGoalLinks();
  const [draft, setDraft] = useState("");
  const [dupNotice, setDupNotice] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const handleAdd = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    const created = goalsStore.add(text);
    if (!created) {
      setDupNotice(true);
      return;
    }
    setDraft("");
    setDupNotice(false);
  }, [draft]);

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
    },
    [confirm, tasksByGoal],
  );

  const composer = (
    <View>
      <View style={styles.composer}>
        <TextInput
          value={draft}
          onChangeText={(t) => {
            setDraft(t);
            if (dupNotice) setDupNotice(false);
          }}
          placeholder="Add a long-term goal..."
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
          blurOnSubmit
        />
        <Pressable
          onPress={handleAdd}
          disabled={!draft.trim()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Add goal"
          style={({ pressed }) => [
            styles.addBtn,
            !draft.trim() && styles.addBtnDisabled,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text style={[styles.addBtnText, !draft.trim() && styles.addBtnTextDisabled]}>Add</Text>
        </Pressable>
      </View>
      {dupNotice ? (
        <Text style={styles.dupNotice}>You already have a goal with that name.</Text>
      ) : null}
    </View>
  );

  const emptyBlock = (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>No goals yet.</Text>
      <Text style={styles.emptyText}>
        Capture the long-horizon things that should guide your timeline. New tasks can
        be linked to a goal from the Capture sheet.
      </Text>
    </Animated.View>
  );

  const footerHint = (
    <Text style={styles.footerHint}>Private to this device. Goals don't sync.</Text>
  );

  return (
    <FlatList<GoalItem>
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingTop: spacing.md,
        paddingBottom: tabBarHeight + 84,
      }}
      data={goals}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View>
          {goals.length > 0 ? (
            <Text style={styles.sectionMeta}>{`${goals.length} active`}</Text>
          ) : null}
          {composer}
        </View>
      }
      ListEmptyComponent={isHydrated ? emptyBlock : null}
      ListFooterComponent={goals.length > 0 ? footerHint : null}
      renderItem={({ item }) => {
        const progress = progressByGoal.get(item.id) ?? { total: 0, done: 0, ratio: 0 };
        const linked = tasksByGoal.get(item.id) ?? [];
        const isExpanded = expandedId === item.id;
        const hasTasks = progress.total > 0;
        const isComplete = hasTasks && progress.done === progress.total;
        return (
          <View style={[styles.goalCard, isComplete && styles.goalCardComplete]}>
            <Pressable
              onPress={() => setExpandedId(isExpanded ? null : item.id)}
              onLongPress={() => void handleDelete(item)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Goal: ${item.text}. Long-press to delete.`}
              style={({ pressed }) => [styles.goalTap, pressed && { opacity: 0.85 }]}
            >
              <View style={styles.goalHead}>
                <Text style={styles.goalText} numberOfLines={3}>
                  {item.text}
                </Text>
                <Text style={styles.goalCount}>
                  {hasTasks ? `${progress.done}/${progress.total}` : "—"}
                </Text>
              </View>

              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(progress.ratio * 100)}%` },
                    isComplete && styles.progressFillComplete,
                  ]}
                />
              </View>

              <View style={styles.goalMetaRow}>
                <Text style={styles.goalMeta}>
                  {hasTasks
                    ? isComplete
                      ? "All linked tasks done"
                      : `${progress.total - progress.done} open`
                    : "No tasks linked yet"}
                </Text>
                {hasTasks ? (
                  <Text style={styles.goalToggle}>{isExpanded ? "Hide" : "Show"}</Text>
                ) : null}
              </View>
            </Pressable>

            {isExpanded && linked.length > 0 ? (
              <View style={styles.linkedList}>
                {linked.map((t) => {
                  const done = t.status === "completed";
                  return (
                    <View key={String(t._id)} style={styles.linkedRow}>
                      <View
                        style={[
                          styles.linkedDot,
                          done ? styles.linkedDotDone : styles.linkedDotOpen,
                        ]}
                      />
                      <Text
                        style={[styles.linkedText, done && styles.linkedTextDone]}
                        numberOfLines={2}
                      >
                        {t.title}
                      </Text>
                      <Pressable
                        onPress={() => goalLinksStore.setLink(String(t._id), null)}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={`Unlink ${t.title} from this goal`}
                        style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                      >
                        <Text style={styles.linkedUnlink}>Unlink</Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </View>
        );
      }}
      showsVerticalScrollIndicator={false}
    />
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
  composer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    color: colors.textPrimary,
    ...typography.bodyMd,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  addBtn: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  addBtnDisabled: {
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  addBtnText: {
    ...typography.title,
    color: colors.bg,
  },
  addBtnTextDisabled: {
    color: colors.textMuted,
  },
  dupNotice: {
    ...typography.micro,
    color: colors.error,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
  goalMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  goalMeta: {
    ...typography.micro,
    color: colors.textMuted,
  },
  goalToggle: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: "600",
  },
  linkedList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    paddingTop: spacing.sm,
  },
  linkedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  linkedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  linkedDotDone: {
    backgroundColor: colors.success,
  },
  linkedDotOpen: {
    backgroundColor: colors.border,
  },
  linkedText: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  linkedTextDone: {
    color: colors.textMuted,
    textDecorationLine: "line-through",
  },
  linkedUnlink: {
    ...typography.micro,
    color: colors.textSecondary,
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
