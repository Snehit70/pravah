import { memo, useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { colors, fonts, spacing } from "../theme/tokens";

export type TabKey = "inbox" | "timeline" | "goals" | "insights";

type BottomTabBarProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  bottomInset?: number;
};

const tabs: { key: TabKey; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "timeline", label: "Timeline" },
  { key: "goals", label: "Goals" },
  { key: "insights", label: "Insights" },
];

type TabLayout = { x: number; width: number };

function BottomTabBarInner({ active, onChange, bottomInset = spacing.md }: BottomTabBarProps) {
  // Per-tab layout populated by onLayout. The underline can only animate to a
  // tab once that tab has reported its position; in practice this happens on
  // the first frame so the underline is in the right place on mount.
  const [layouts, setLayouts] = useState<Partial<Record<TabKey, TabLayout>>>({});
  const indicatorX = useSharedValue(0);
  const indicatorW = useSharedValue(0);
  // Mark whether the indicator has ever been positioned so we skip the
  // animation on the very first paint (no slide-in from x=0).
  const hasPositioned = useRef(false);

  useEffect(() => {
    const layout = layouts[active];
    if (!layout) return;
    if (!hasPositioned.current) {
      indicatorX.value = layout.x;
      indicatorW.value = layout.width;
      hasPositioned.current = true;
      return;
    }
    indicatorX.value = withTiming(layout.x, {
      duration: 220,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
    indicatorW.value = withTiming(layout.width, {
      duration: 220,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
    });
  }, [active, layouts, indicatorX, indicatorW]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: indicatorW.value,
  }));

  const handleLayout = useCallback((key: TabKey, e: LayoutChangeEvent) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => {
      const existing = prev[key];
      if (existing && existing.x === x && existing.width === width) return prev;
      return { ...prev, [key]: { x, width } };
    });
  }, []);

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
      <View style={styles.bar} accessibilityRole="tablist">
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => handlePress(tab.key)}
            onLayout={(e) => handleLayout(tab.key, e)}
            style={({ pressed }) => [styles.tabItem, pressed && styles.tabItemPressed]}
            hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active === tab.key }}
            accessibilityLabel={tab.label}
          >
            <Text style={[styles.tabLabel, active === tab.key && styles.tabLabelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        ))}
        {/* Animated copper underline. Sits absolutely positioned at the
            bottom of the bar and slides between tabs via Reanimated. */}
        <Animated.View style={[styles.indicator, indicatorStyle]} />
      </View>
    </View>
  );
}

export const BottomTabBar = memo(BottomTabBarInner);

const styles = StyleSheet.create({
  // Container draws a single hairline divider on top \u2014 no enclosing pill.
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
    elevation: 40,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  // The bar uses position: relative so the absolute indicator anchors to it.
  bar: {
    flexDirection: "row",
    position: "relative",
  },
  tabItem: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  tabItemPressed: {
    opacity: 0.6,
  },
  tabLabel: {
    color: colors.textMuted,
    fontFamily: fonts.sansSemibold,
    fontSize: 13,
    letterSpacing: 0.4,
  },
  tabLabelActive: {
    color: colors.textPrimary,
  },
  // 2px copper underline. Anchored to the bottom of the bar and animated
  // between tabs by translateX + width. Width is set dynamically via the
  // animated style; height stays at 2.
  indicator: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
});
