/**
 * InsightsScreen
 *
 * Two-pane wrapper for the "Insights" tab: a segmented control at the top
 * switches between Stats (default) and Done (the historic completed task
 * list). Replaces the old standalone Done tab — Done is now one tap inside
 * Insights rather than its own tab slot. The KPI tile + chart wiring lives
 * in StatsScreen; this screen only owns the segmented control and routes
 * the right child to render below.
 */

import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { JSX } from "react";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { CompletedScreen } from "./CompletedScreen";
import { StatsScreen } from "./StatsScreen";
import type { MobileTask } from "../components/TaskCard";

type Segment = "stats" | "done";

type InsightsScreenProps = {
  tasks: MobileTask[];
  completedTasks: MobileTask[];
  isLoading: boolean;
  isRefreshing: boolean;
  tabBarHeight: number;
  onRefresh: () => Promise<void>;
  renderCompletedTaskItem: ({ item }: { item: MobileTask }) => JSX.Element;
};

export function InsightsScreen({
  tasks,
  completedTasks,
  isLoading,
  isRefreshing,
  tabBarHeight,
  onRefresh,
  renderCompletedTaskItem,
}: InsightsScreenProps) {
  const [segment, setSegment] = useState<Segment>("stats");

  return (
    <View style={styles.wrap}>
      <View style={styles.segmentRow}>
        <SegmentButton
          label="Insights"
          active={segment === "stats"}
          onPress={() => setSegment("stats")}
        />
        <SegmentButton
          label="Done"
          active={segment === "done"}
          onPress={() => setSegment("done")}
        />
      </View>
      {segment === "stats" ? (
        <StatsScreen tasks={tasks} tabBarHeight={tabBarHeight} />
      ) : (
        <CompletedScreen
          tasks={completedTasks}
          isLoading={isLoading}
          isRefreshing={isRefreshing}
          tabBarHeight={tabBarHeight}
          onRefresh={onRefresh}
          renderItem={renderCompletedTaskItem}
        />
      )}
    </View>
  );
}

function SegmentButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      hitSlop={8}
      style={({ pressed }) => [
        styles.segmentBtn,
        active && styles.segmentBtnActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  segmentRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    padding: 3,
    borderRadius: radii.full,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 2,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentBtnActive: {
    backgroundColor: colors.accentSoft,
  },
  segmentText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.accent,
  },
});
