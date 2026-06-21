import { memo, useCallback, useEffect, useRef, type JSX } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { haptic } from "../lib/haptic";
import { resolveTabOrder, TAB_LABELS, type TabKey } from "../lib/tabOrder";
import { colors, radii, shadow, spacing } from "../theme/tokens";

export type { TabKey } from "../lib/tabOrder";

type BottomTabBarProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  onCapture: () => void;
  canCapture?: boolean;
  bottomInset?: number;
  tabOrder?: readonly TabKey[];
};

type IconProps = { filled: boolean; color: string; size: number };

// ── Icons ──────────────────────────────────────────────────────────────
// Hand-authored matched outline/filled pairs. Two copies are stacked and
// cross-faded per tab, so each active state remains a mark fill, not a pill.

const STROKE = 2.1;

function frame(color: string, size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: color,
    strokeWidth: STROKE,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

// Inbox — open tray with a down-arrow.
function InboxTrayIcon({ filled, color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path
        fill={filled ? color : "none"}
        d="M3.8 12.4h4.05c.5 0 .92.34 1.04.82l.08.34c.14.56.65.96 1.23.96h3.6c.58 0 1.09-.4 1.23-.96l.08-.34c.12-.48.54-.82 1.04-.82h4.05l-1.25 6.45A2.25 2.25 0 0 1 16.74 20H7.26a2.25 2.25 0 0 1-2.21-1.15L3.8 12.4Z"
      />
      <Path d="M3.8 12.4h4.05c.5 0 .92.34 1.04.82l.08.34c.14.56.65.96 1.23.96h3.6c.58 0 1.09-.4 1.23-.96l.08-.34c.12-.48.54-.82 1.04-.82h4.05" />
      <Path d="m3.8 12.4 1.25 6.45A2.25 2.25 0 0 0 7.26 20h9.48a2.25 2.25 0 0 0 2.21-1.15l1.25-6.45" />
      <Path d="M12 3.7v7.1" />
      <Path d="m8.95 7.95 3.05 3.1 3.05-3.1" />
    </Svg>
  );
}

// Timeline — agenda rows.
function AgendaIcon({ filled, color, size }: IconProps) {
  const rowFill = filled ? color : "none";
  return (
    <Svg {...frame(color, size)}>
      <Circle cx={5.3} cy={6.2} r={1.45} fill={filled ? color : "none"} />
      <Path fill={rowFill} d="M9 4.85h10.8v2.7H9z" />
      <Line x1={9} y1={6.2} x2={19.8} y2={6.2} />
      <Circle cx={5.3} cy={12} r={1.45} fill={filled ? color : "none"} />
      <Path fill={rowFill} d="M9 10.65h7.6v2.7H9z" />
      <Line x1={9} y1={12} x2={16.6} y2={12} />
      <Circle cx={5.3} cy={17.8} r={1.45} fill={filled ? color : "none"} />
      <Path fill={rowFill} d="M9 16.45h9.2v2.7H9z" />
      <Line x1={9} y1={17.8} x2={18.2} y2={17.8} />
    </Svg>
  );
}

// Goals — mountain.
function MountainIcon({ filled, color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path
        fill={filled ? color : "none"}
        d="M2.8 19.8 9 5.1l3.25 7.2 3.1-4.15 5.85 11.65H2.8Z"
      />
      <Path d="M9 5.1 12.25 12.3l3.1-4.15 5.85 11.65H2.8L9 5.1Z" />
      <Path d="m7.15 13.65 2.2-1.95 2 2.6 2.45-2.8 2.35 3.25" />
    </Svg>
  );
}

// Progress — upward trend line.
function TrendIcon({ filled, color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path
        fill={filled ? color : "none"}
        d="M4.2 18.9v-4.55l3.75-3.45 3.35 2.7 5.95-6.55 2.55 2.3v9.55H4.2Z"
      />
      <Path d="M4.2 18.9h15.6" />
      <Path d="m4.2 14.35 3.75-3.45 3.35 2.7 5.95-6.55 2.55 2.3" />
      <Path d="M17.05 6.95h3v3" />
    </Svg>
  );
}

// Capture — bare plus inside the existing accent pill.
function CaptureIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg {...frame(color, size)}>
      <Path d="M12 6.2v11.6" />
      <Path d="M6.2 12h11.6" />
    </Svg>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────

type NavIcon = (p: IconProps) => JSX.Element;

const NAV_TABS: Record<TabKey, { key: TabKey; label: string; Icon: NavIcon }> = {
  inbox: { key: "inbox", label: TAB_LABELS.inbox, Icon: InboxTrayIcon },
  timeline: { key: "timeline", label: TAB_LABELS.timeline, Icon: AgendaIcon },
  goals: { key: "goals", label: TAB_LABELS.goals, Icon: MountainIcon },
  insights: { key: "insights", label: TAB_LABELS.insights, Icon: TrendIcon },
};

const ICON_SIZE = 22;
const SPRING = { damping: 18, stiffness: 320 };
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function NavTab({
  tab,
  active,
  onPress,
}: {
  tab: (typeof NAV_TABS)[TabKey];
  active: boolean;
  onPress: () => void;
}) {
  const press = useSharedValue(1);
  const pop = useSharedValue(1);
  const fade = useSharedValue(active ? 1 : 0); // 0 = outline, 1 = filled
  const mounted = useRef(false);

  useEffect(() => {
    fade.set(withTiming(active ? 1 : 0, { duration: 200 }));
    // Pop only when a tab *becomes* active by interaction, not on first mount.
    if (active && mounted.current) {
      pop.set(
        withSequence(
          withTiming(1.16, { duration: 120 }),
          withSpring(1, { damping: 12, stiffness: 360 })
        )
      );
    }
    mounted.current = true;
  }, [active, fade, pop]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value * pop.value }],
  }));
  const outlineStyle = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));
  const filledStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  const { Icon } = tab;

  return (
    <AnimatedPressable
      onPress={onPress}
      onPressIn={() => press.set(withSpring(0.9, SPRING))}
      onPressOut={() => press.set(withSpring(1, SPRING))}
      style={styles.tabItem}
      hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={tab.label}
    >
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        <Animated.View style={[styles.iconLayer, outlineStyle]}>
          <Icon filled={false} color={colors.textSecondary} size={ICON_SIZE} />
        </Animated.View>
        <Animated.View style={[styles.iconLayer, filledStyle]}>
          <Icon filled color={colors.accent} size={ICON_SIZE} />
        </Animated.View>
      </Animated.View>
    </AnimatedPressable>
  );
}

function CaptureButton({
  onCapture,
  canCapture,
}: {
  onCapture: () => void;
  canCapture: boolean;
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
          scale.set(withSpring(0.9, SPRING));
          glow.set(withTiming(1, { duration: 140 }));
        }}
        onPressOut={() => {
          scale.set(withSpring(1, SPRING));
          glow.set(withTiming(0, { duration: 280 }));
        }}
        disabled={!canCapture}
        style={[styles.captureBtn, !canCapture && styles.captureDisabled, btnStyle]}
        hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Capture a new task"
      >
        <CaptureIcon color={colors.textPrimary} size={ICON_SIZE} />
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
          />
        ))}

        <CaptureButton onCapture={onCapture} canCapture={canCapture} />

        {rightTabs.map((tab) => (
          <NavTab
            key={tab}
            tab={NAV_TABS[tab]}
            active={active === tab}
            onPress={() => handlePress(tab)}
          />
        ))}
      </View>
    </View>
  );
}

export const BottomTabBar = memo(BottomTabBarInner);

const styles = StyleSheet.create({
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
  tabItem: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
  },
  iconLayer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  captureSlot: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  captureHalo: {
    position: "absolute",
    width: "100%",
    height: 50,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  captureBtn: {
    alignSelf: "stretch",
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    backgroundColor: colors.accent,
    ...shadow.glow,
  },
  captureDisabled: {
    opacity: 0.45,
  },
});
