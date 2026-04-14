import { memo, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, radii, spacing, typography } from "../theme/tokens";

export type TabKey = "inbox" | "timeline" | "completed";

type BottomTabBarProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  inboxCount: number;
  timelineCount: number;
  doneCount: number;
  bottomInset?: number;
};

const tabs: { key: TabKey; label: string; countKey: "inbox" | "timeline" | "done" }[] = [
  { key: "inbox", label: "Inbox", countKey: "inbox" },
  { key: "timeline", label: "Timeline", countKey: "timeline" },
  { key: "completed", label: "Done", countKey: "done" },
];

function BottomTabBarInner({
  active,
  onChange,
  inboxCount,
  timelineCount,
  doneCount,
  bottomInset = spacing.md,
}: BottomTabBarProps) {
  const counts = { inbox: inboxCount, timeline: timelineCount, done: doneCount };

  const handlePress = useCallback(
    (tab: TabKey) => {
      if (tab !== active) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onChange(tab);
      }
    },
    [active, onChange]
  );

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      <View style={styles.bar}>
        {tabs.map((tab) => {
          const isActive = active === tab.key;
          const count = counts[tab.countKey];
          return (
            <TabItem
              key={tab.key}
              tabKey={tab.key}
              label={tab.label}
              count={count}
              isActive={isActive}
              onPress={handlePress}
            />
          );
        })}
      </View>
    </View>
  );
}

type TabItemProps = {
  tabKey: TabKey;
  label: string;
  count: number;
  isActive: boolean;
  onPress: (key: TabKey) => void;
};

function TabItemInner({ tabKey, label, count, isActive, onPress }: TabItemProps) {
  return (
    <Pressable
      onPress={() => onPress(tabKey)}
      style={styles.tabItem}
      hitSlop={{ top: 8, bottom: 8 }}
    >
      <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
        {label}
      </Text>
      {count > 0 ? (
        <Text style={[styles.tabCount, isActive && styles.tabCountActive]}>
          {count}
        </Text>
      ) : null}
      <View style={[styles.activeDot, !isActive && styles.activeDotHidden]} />
    </Pressable>
  );
}

const TabItem = memo(TabItemInner);

export const BottomTabBar = memo(BottomTabBarInner);

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bar: {
    flexDirection: "row",
    backgroundColor: colors.bgInput,
    borderRadius: radii.xl,
    padding: spacing.xs,
  },
  tabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    gap: 4,
  },
  tabLabel: {
    color: colors.textMuted,
    ...typography.bodySmall,
  },
  tabLabelActive: {
    color: colors.textPrimary,
    fontWeight: "700",
  },
  tabCount: {
    color: colors.textMuted,
    ...typography.caption,
  },
  tabCountActive: {
    color: colors.accent,
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  activeDotHidden: {
    opacity: 0,
  },
});
