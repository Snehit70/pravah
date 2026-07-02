import { memo, useCallback, type JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
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

export type { TabKey } from "../lib/tabOrder";

type BottomTabBarProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  onCapture: () => void;
  canCapture?: boolean;
  bottomInset?: number;
  tabOrder?: readonly TabKey[];
};

type IconProps = { color: string; size: number };

// ── Icons ──────────────────────────────────────────────────────────────
// Calm, literal metaphors on a stable 24x24 grid. Active state is expressed
// through color and nearby chrome rather than by swapping to a different icon.

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

function InboxTrayIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path d="M3 8.5h18l-2 9.5H5L3 8.5Z" />
      <Path d="M8 8.5V6.75A1.75 1.75 0 0 1 9.75 5h4.5A1.75 1.75 0 0 1 16 6.75V8.5" />
      <Path d="M3.75 13h4.7l1.1 2h4.9l1.1-2h4.7" />
    </Svg>
  );
}

function CalendarIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Rect x={3.5} y={5} width={17} height={15} rx={3} />
      <Line x1={8} y1={3.75} x2={8} y2={7.25} />
      <Line x1={16} y1={3.75} x2={16} y2={7.25} />
      <Line x1={3.5} y1={9} x2={20.5} y2={9} />
      <Rect x={7} y={12} width={3} height={3} rx={1} />
      <Rect x={11} y={12} width={3} height={3} rx={1} />
      <Rect x={15} y={12} width={3} height={3} rx={1} />
    </Svg>
  );
}

function TargetIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Circle cx={12} cy={12} r={7.25} />
      <Circle cx={12} cy={12} r={3.75} />
      <Circle cx={12} cy={12} r={1.35} fill={color} stroke="none" />
    </Svg>
  );
}

function TrendIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path d="M4 18.5h16" />
      <Path d="M6 15.5 10 11l3 2.5 5-6" />
      <Path d="M15.5 7.5H18v2.5" />
    </Svg>
  );
}

function CaptureIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg {...frame(color, size)}>
      <Line x1={12} y1={5.25} x2={12} y2={18.75} />
      <Line x1={5.25} y1={12} x2={18.75} y2={12} />
    </Svg>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────

type NavIcon = (p: IconProps) => JSX.Element;

const NAV_TABS: Record<TabKey, { key: TabKey; label: string; Icon: NavIcon }> = {
  inbox: { key: "inbox", label: TAB_LABELS.inbox, Icon: InboxTrayIcon },
  timeline: { key: "timeline", label: TAB_LABELS.timeline, Icon: CalendarIcon },
  goals: { key: "goals", label: TAB_LABELS.goals, Icon: TargetIcon },
  insights: { key: "insights", label: TAB_LABELS.insights, Icon: TrendIcon },
};

const ICON_SIZE = 22;
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
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ scale: press.value }],
  }));

  const { Icon } = tab;

  return (
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
      style={({ pressed }) => [
        styles.tabItem,
        active && styles.tabItemActive,
        pressed && { opacity: 0.78 },
      ]}
    >
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        <Icon color={active ? colors.accent : colors.textMuted} size={ICON_SIZE} />
      </Animated.View>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
        {tab.label}
      </Text>
    </AnimatedPressable>
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
    gap: 2,
    borderRadius: radii.full,
  },
  tabItemActive: {
    backgroundColor: colors.accentDim,
  },
  iconWrap: {
    width: ICON_SIZE,
    height: ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
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
