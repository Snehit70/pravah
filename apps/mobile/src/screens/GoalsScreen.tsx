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
  Alert,
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

type GoalsScreenProps = {
  tabBarHeight: number;
};

export function GoalsScreen({ tabBarHeight }: GoalsScreenProps) {
  const [goals, setGoals] = useState<GoalItem[]>([]);
  const [draft, setDraft] = useState("");
  const [isHydrated, setIsHydrated] = useState(false);
  // Distinguish "loaded zero goals" from "load failed" so the save effect
  // doesn't overwrite a temporarily unreadable store with an empty list.
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await loadGoals();
      if (cancelled) return;
      if (result.kind === "error") {
        setLoadFailed(true);
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
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isHydrated || loadFailed) return;
    void saveGoals(goals);
  }, [goals, isHydrated, loadFailed]);

  const handleAdd = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setGoals((prev) => [...prev, createGoal(text)]);
    setDraft("");
  }, [draft]);

  const handleDelete = useCallback((goal: GoalItem) => {
    Alert.alert(
      "Delete goal?",
      goal.text,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => setGoals((prev) => prev.filter((g) => g.id !== goal.id)),
        },
      ],
      { cancelable: true }
    );
  }, []);

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
          pressed && { opacity: 0.7 },
          !draft.trim() && { opacity: 0.4 },
        ]}
      >
        <Text style={styles.addBtnText}>Add</Text>
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
    <Text style={styles.footerHint}>Saved locally on this device.</Text>
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
          <View style={styles.headingRow}>
            <Text style={styles.headingLabel}>Long horizon</Text>
            <Text style={styles.headingCount}>
              {goals.length === 0 ? "" : `${goals.length} active`}
            </Text>
          </View>
          {composer}
        </View>
      }
      ListEmptyComponent={isHydrated ? emptyBlock : null}
      ListFooterComponent={goals.length > 0 ? footerHint : null}
      renderItem={({ item }) => (
        <View style={styles.goalRow}>
          <Text style={styles.goalText}>{item.text}</Text>
          <Pressable
            onPress={() => handleDelete(item)}
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
  headingRow: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headingLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  headingCount: {
    ...typography.micro,
    color: colors.textMuted,
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
  addBtnText: {
    ...typography.title,
    color: colors.bg,
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
