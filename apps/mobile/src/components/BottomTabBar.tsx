import { memo, useCallback, useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { haptic } from "../lib/haptic";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { resolveTabOrder, TAB_LABELS, type TabKey } from "../lib/tabOrder";
import { colors, radii, shadow, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { TabNavIcon } from "./tabNavIcons";

export type { TabKey } from "../lib/tabOrder";

type BottomTabBarProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  onCapture: () => void;
  canCapture?: boolean;
  bottomInset?: number;
  tabOrder?: readonly TabKey[];
};

function CaptureIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Line x1={12} y1={5.25} x2={12} y2={18.75} />
      <Line x1={5.25} y1={12} x2={18.75} y2={12} />
    </Svg>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────
// The active state is an area-fill: the filled twin of each mark is revealed
// through a rising clip mask rather than swapping color chrome.

type FillDirection = "up" | "right";

const NAV_TABS: Record<
  TabKey,
  { key: TabKey; label: string; fillDirection: FillDirection }
> = {
  inbox: { key: "inbox", label: TAB_LABELS.inbox, fillDirection: "up" },
  timeline: { key: "timeline", label: TAB_LABELS.timeline, fillDirection: "up" },
  goals: { key: "goals", label: TAB_LABELS.goals, fillDirection: "up" },
  insights: { key: "insights", label: TAB_LABELS.insights, fillDirection: "right" },
};

const ICON_SIZE = 22;
const FILL_DURATION = 280;
const SPRING = { damping: 18, stiffness: 320 };
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function NavTab({
  tab,
  active,
  onPress,
  reducedMotion,
}: {
  tab: (typeof NAV_TABS)[TabKey];
  active: boolean;
  onPress: () => void;
  reducedMotion: boolean;
}) {
  const press = useSharedValue(1);
  const fill = useSharedValue(active ? 1 : 0);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const { fillDirection } = tab;

  useEffect(() => {
    const target = active ? 1 : 0;
    fill.set(reducedMotion ? target : withTiming(target, { duration: FILL_DURATION }));
  }, [active, reducedMotion, fill]);

  // Directional fill-rise: the filled twin is revealed through a fixed-size
  // clip window that slides in (bottom-up for tray/mountain/agenda,
  // left-to-right for trend) while the icon inside slides the opposite way so
  // it stays visually pinned. Transforms only — animating width/height here
  // went through layout and could wedge the mask open at a stale size,
  // leaving an inactive tab rendered with its filled twin.
  const maskStyle = useAnimatedStyle(() => {
    const offset = (1 - fill.value) * ICON_SIZE;
    return {
      transform:
        fillDirection === "right"
          ? [{ translateX: -offset }]
          : [{ translateY: offset }],
    };
  });
  const maskInnerStyle = useAnimatedStyle(() => {
    const offset = (1 - fill.value) * ICON_SIZE;
    return {
      transform:
        fillDirection === "right"
          ? [{ translateX: offset }]
          : [{ translateY: -offset }],
    };
  });

  return (
    <View style={styles.slot}>
      <AnimatedPressable
        onPress={onPress}
        onPressIn={() => {
          if (!reducedMotion) press.set(withSpring(0.9, SPRING));
        }}
        onPressOut={() => {
          if (!reducedMotion) press.set(withSpring(1, SPRING));
        }}
        hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={tab.label}
        style={({ pressed }) => [styles.tabItem, pressed && { opacity: 0.78 }]}
      >
        <Animated.View style={[styles.iconWrap, iconStyle]}>
          <TabNavIcon
            tab={tab.key}
            color={active ? colors.accent : colors.textMuted}
            size={ICON_SIZE}
          />
          <View pointerEvents="none" style={styles.fillClip}>
            <Animated.View style={[styles.fillMask, maskStyle]}>
              <Animated.View style={maskInnerStyle}>
                <TabNavIcon tab={tab.key} fill color={colors.accent} size={ICON_SIZE} />
              </Animated.View>
            </Animated.View>
          </View>
        </Animated.View>
        <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
          {tab.label}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

function CaptureButton({
  onCapture,
  canCapture,
  reducedMotion,
}: {
  onCapture: () => void;
  canCapture: boolean;
  reducedMotion: boolean;
}) {
  const scale = useSharedValue(1);
  const glow = useSharedValue(0);

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  // Glow pulse — a soft accent halo behind the button blooms on press.
  const haloStyle = useAnimatedStyle(() => ({
    opacity: glow.value * 0.5,
    transform: [{ scale: 1 + glow.value * 0.35 }],
  }));

  return (
    <View style={styles.captureSlot}>
      <Animated.View pointerEvents="none" style={[styles.captureHalo, haloStyle]} />
      <AnimatedPressable
        onPress={() => {
          haptic.medium();
          onCapture();
        }}
        onPressIn={() => {
          if (reducedMotion) return;
          scale.set(withSpring(0.9, SPRING));
          glow.set(withTiming(1, { duration: 140 }));
        }}
        onPressOut={() => {
          if (reducedMotion) return;
          scale.set(withSpring(1, SPRING));
          glow.set(withTiming(0, { duration: 280 }));
        }}
        disabled={!canCapture}
        style={[styles.captureBtn, !canCapture && styles.captureDisabled, btnStyle]}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Capture a new task"
      >
        <CaptureIcon color={colors.textInverse} size={ICON_SIZE} />
      </AnimatedPressable>
    </View>
  );
}

function BottomTabBarInner({
  active,
  onChange,
  onCapture,
  canCapture = true,
  bottomInset = spacing.md,
  tabOrder,
}: BottomTabBarProps) {
  const reducedMotion = useReducedMotion();
  const resolvedOrder = resolveTabOrder(tabOrder);
  const leftTabs = resolvedOrder.slice(0, 2);
  const rightTabs = resolvedOrder.slice(2);
  const handlePress = useCallback(
    (tab: TabKey) => {
      if (tab !== active) {
        haptic.light();
        onChange(tab);
      }
    },
    [active, onChange]
  );

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {leftTabs.map((tab) => (
          <NavTab
            key={tab}
            tab={NAV_TABS[tab]}
            active={active === tab}
            onPress={() => handlePress(tab)}
            reducedMotion={reducedMotion}
          />
        ))}

        <CaptureButton
          onCapture={onCapture}
          canCapture={canCapture}
          reducedMotion={reducedMotion}
        />

        {rightTabs.map((tab) => (
          <NavTab
            key={tab}
            tab={NAV_TABS[tab]}
            active={active === tab}
            onPress={() => handlePress(tab)}
            reducedMotion={reducedMotion}
          />
        ))}
      </View>
    </View>
  );
}

export const BottomTabBar = memo(BottomTabBarInner);

const styles = createThemedStyles({
  // Single hairline divider on top — no enclosing pill.
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
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  // Layout flex lives on plain wrapper Views: flex on the animated Pressable
  // itself does not survive createAnimatedComponent's style flattening, which
  // let the capture slot absorb all the slack and un-even the five slots.
  slot: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  tabItem: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
    gap: 2,
    borderRadius: radii.full,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  // Stationary anchor over the outline icon. It must NOT clip — the sliding
  // window below moves outside its bounds while inactive.
  fillClip: {
    position: "absolute",
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  // The sliding clip window: translated off the icon when inactive while the
  // filled twin inside counter-translates to stay visually pinned, so only
  // the overlapped portion of the fill shows through.
  fillMask: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    overflow: "hidden",
  },
  tabLabel: {
    ...typography.micro,
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.2,
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.accent,
  },
  captureSlot: {
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  captureHalo: {
    position: "absolute",
    width: 54,
    height: 46,
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
  },
  captureBtn: {
    width: 54,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
    ...shadow.glow,
  },
  captureDisabled: {
    opacity: 0.45,
  },
});
