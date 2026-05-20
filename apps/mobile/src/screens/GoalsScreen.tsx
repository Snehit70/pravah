/**
 * GoalsScreen
 *
 * Mobile parity with web LongTermGoalsPage: a local list of long-horizon goals
 * persisted to AsyncStorage. No Convex sync — the web app stores this in
 * localStorage, so each surface keeps its own list.
 *
 * Reordering by drag is intentionally absent: react-native-draggable-flatlist
 * is currently incompatible with Reanimated 4 in this app (see InboxScreen
 * comment). Delete-and-readd is the manual reorder path until that's fixed.
 */

import { useCallback, useEffect, useState } from "react";
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
import { createGoal, loadGoals, saveGoals, type GoalItem } from "../lib/goalsStorage";
import { useConfirm } from "../hooks/useConfirm";

type GoalsScreenProps = {
  tabBarHeight: number;
};

export function GoalsScreen({ tabBarHeight }: GoalsScreenProps) {
  const confirm = useConfirm();
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [draft, setDraft] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  // Open the save gate only after a successful load OR after the first user
  // edit. This protects an unreadable store from being silently overwritten
  // with an empty list on mount, while still persisting any edits the user
  // makes during/after a failed load.
  const [canSave, setCanSave] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadGoals();
      if (cancelled) return;
      if (result.kind === "error") {
        setIsHydrated(true);
        return;
      }
      // Merge with anything the user added between mount and hydration:
      // appended goals are kept after the loaded set, deduped by id.
      setGoals((prev) => {
        if (prev.length === 0) return result.goals;
        const seen = new Set(result.goals.map((g) => g.id));
        const additions = prev.filter((g) => !seen.has(g.id));
        return additions.length === 0 ? result.goals : [...result.goals, ...additions];
      });
      setIsHydrated(true);
      setCanSave(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!canSave) return;
    void saveGoals(goals);
  }, [goals, canSave]);

  const handleAdd = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setGoals((prev) => [...prev, createGoal(text)]);
    setDraft("");
    setCanSave(true);
  }, [draft]);

  const handleDelete = useCallback(
    async (goal: GoalItem) => {
      const ok = await confirm({
        title: "Delete goal?",
        message: goal.text,
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
      setGoals((prev) => prev.filter((g) => g.id !== goal.id));
      setCanSave(true);
    },
    [confirm],
  );

  const composer = (
    <View style={styles.composer}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
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
  );

  const emptyBlock = (
    <Animated.View entering={FadeIn.duration(400)} style={styles.emptyWrap}>
      <Text style={styles.emptyTitle}>No goals yet.</Text>
      <Text style={styles.emptyText}>
        Capture the long-horizon things that should guide your timeline.
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
      renderItem={({ item }) => (
        <View style={styles.goalRow}>
          <Text style={styles.goalText}>{item.text}</Text>
          <Pressable
            onPress={() => void handleDelete(item)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Delete goal: ${item.text}`}
            style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
          >
            <Text style={styles.deleteBtnText}>Delete</Text>
          </Pressable>
        </View>
      )}
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
  },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
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
  goalRow: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  goalText: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  deleteBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  deleteBtnText: {
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
