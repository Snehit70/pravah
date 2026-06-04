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
import { colors, radii, shadow, spacing } from "../theme/tokens";

export type TabKey = "inbox" | "timeline" | "goals" | "insights";

type BottomTabBarProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  onCapture: () => void;
  canCapture?: boolean;
  bottomInset?: number;
};

type IconProps = { filled: boolean; color: string; size: number };

// ── Icons ──────────────────────────────────────────────────────────────
// Real Lucide paths (viewBox 0 0 24 24). Each renders an outline (inactive)
// or a solid (active) variant from the same shape, so the active state is a
// fill, not a pill. Two copies are stacked and cross-faded per tab.

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

// Inbox — layers/stack. Active fills the top sheet only; the lower two stay
// strokes so the stack still reads as distinct layers.
function LayersIcon({ filled, color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path
        fill={filled ? color : "none"}
        d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"
      />
      <Path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12" />
      <Path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17" />
    </Svg>
  );
}

// Timeline — agenda rows. Leading markers fill when active; staggered line
// lengths read as a schedule rather than a plain list.
function AgendaIcon({ filled, color, size }: IconProps) {
  const r = filled ? 1.7 : 1.4;
  const dot = filled ? color : "none";
  return (
    <Svg {...frame(color, size)}>
      <Circle cx={4.5} cy={6} r={r} fill={dot} />
      <Line x1={8.5} y1={6} x2={20} y2={6} />
      <Circle cx={4.5} cy={12} r={r} fill={dot} />
      <Line x1={8.5} y1={12} x2={16} y2={12} />
      <Circle cx={4.5} cy={18} r={r} fill={dot} />
      <Line x1={8.5} y1={18} x2={18.5} y2={18} />
    </Svg>
  );
}

// Goals — mountain (Lucide mountain-snow). Active fills the peak solid.
function MountainIcon({ filled, color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path fill={filled ? color : "none"} d="m8 3 4 8 5-5 5 15H2L8 3z" />
      <Path d="M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19" />
    </Svg>
  );
}

// Progress — flame. Active fills the whole flame.
function FlameIcon({ filled, color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path
        fill={filled ? color : "none"}
        d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 0c0-2-1.5-3-1.5-5q0-2 2.5-4"
      />
    </Svg>
  );
}

// Capture — thought bubble + spark. Always white-on-accent (it's the hero
// action, not a destination), so no outline/fill toggle.
function CaptureIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg {...frame(color, size)}>
      <Path d="M5 5.5h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3.2V15.5H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z" />
      <Path
        fill={color}
        d="M12 7.6c.25 1.9.9 2.55 2.8 2.8-1.9.25-2.55.9-2.8 2.8-.25-1.9-.9-2.55-2.8-2.8 1.9-.25 2.55-.9 2.8-2.8Z"
      />
    </Svg>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────

type NavIcon = (p: IconProps) => JSX.Element;

const NAV_TABS: { key: TabKey; label: string; Icon: NavIcon }[] = [
  { key: "inbox", label: "Inbox", Icon: LayersIcon },
  { key: "timeline", label: "Timeline", Icon: AgendaIcon },
  { key: "goals", label: "Goals", Icon: MountainIcon },
  { key: "insights", label: "Progress", Icon: FlameIcon },
];

const ICON_SIZE = 22;
const SPRING = { damping: 18, stiffness: 320 };
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function NavTab({
  tab,
  active,
  onPress,
}: {
  tab: (typeof NAV_TABS)[number];
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
}: BottomTabBarProps) {
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
        <NavTab tab={NAV_TABS[0]} active={active === "inbox"} onPress={() => handlePress("inbox")} />
        <NavTab tab={NAV_TABS[1]} active={active === "timeline"} onPress={() => handlePress("timeline")} />

        <CaptureButton onCapture={onCapture} canCapture={canCapture} />

        <NavTab tab={NAV_TABS[2]} active={active === "goals"} onPress={() => handlePress("goals")} />
        <NavTab tab={NAV_TABS[3]} active={active === "insights"} onPress={() => handlePress("insights")} />
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
