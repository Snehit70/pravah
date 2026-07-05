import { memo, useCallback, useEffect, type JSX } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path } from "react-native-svg";
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
// Hand-authored matched outline+fill pairs on a stable 24x24 grid (ADR-0005).
// The active state is an area-fill: the filled twin of each mark is revealed
// through a rising clip mask rather than swapping color chrome.

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

// Inbox — open tray with an arrow dropping in.
const INBOX_TRAY = "M3.4 13h4.5l1.2 2.2h5.8l1.2-2.2h4.5v4.3a2.2 2.2 0 0 1-2.2 2.2H5.6a2.2 2.2 0 0 1-2.2-2.2Z";

function InboxTrayIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path d={INBOX_TRAY} />
      <Path d="M12 4.2v6.2" />
      <Path d="m9 7.6 3 3 3-3" />
    </Svg>
  );
}

function InboxTrayFillIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path d={INBOX_TRAY} fill={color} />
      <Path d="M12 4.2v6.2" />
      <Path d="m9 7.6 3 3 3-3" />
    </Svg>
  );
}

// Timeline — agenda rows: dot + entry line, repeated.
const AGENDA_ROWS = [5.6, 12, 18.4] as const;

function AgendaIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      {AGENDA_ROWS.map((y) => (
        <Circle key={y} cx={5.3} cy={y} r={1.7} />
      ))}
      {AGENDA_ROWS.map((y) => (
        <Line key={y} x1={10.2} y1={y} x2={20.6} y2={y} />
      ))}
    </Svg>
  );
}

function AgendaFillIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      {AGENDA_ROWS.map((y) => (
        <Circle key={y} cx={5.3} cy={y} r={1.7} fill={color} />
      ))}
      {AGENDA_ROWS.map((y) => (
        <Line key={y} x1={10.2} y1={y} x2={20.6} y2={y} />
      ))}
    </Svg>
  );
}

// Goals — mountain ridge, twin peaks.
const MOUNTAIN = "M2.9 18.75 9 7.5l3.4 5.5 2.8-4.3 5.9 10.05Z";

function MountainIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path d={MOUNTAIN} />
    </Svg>
  );
}

function MountainFillIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path d={MOUNTAIN} fill={color} />
    </Svg>
  );
}

// Progress — upward trend; filled twin shades the area under the curve.
function TrendIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path d="M4 18.5h16" />
      <Path d="M6 15.5 10 11l3 2.5 5-6" />
      <Path d="M15.5 7.5H18v2.5" />
    </Svg>
  );
}

function TrendFillIcon({ color, size }: IconProps) {
  return (
    <Svg {...frame(color, size)}>
      <Path d="M6 15.5 10 11l3 2.5 5-6V18.5H6Z" fill={color} stroke="none" />
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
type FillDirection = "up" | "right";

const NAV_TABS: Record<
  TabKey,
  { key: TabKey; label: string; Icon: NavIcon; FillIcon: NavIcon; fillDirection: FillDirection }
> = {
  inbox: {
    key: "inbox",
    label: TAB_LABELS.inbox,
    Icon: InboxTrayIcon,
    FillIcon: InboxTrayFillIcon,
    fillDirection: "up",
  },
  timeline: {
    key: "timeline",
    label: TAB_LABELS.timeline,
    Icon: AgendaIcon,
    FillIcon: AgendaFillIcon,
    fillDirection: "up",
  },
  goals: {
    key: "goals",
    label: TAB_LABELS.goals,
    Icon: MountainIcon,
    FillIcon: MountainFillIcon,
    fillDirection: "up",
  },
  insights: {
    key: "insights",
    label: TAB_LABELS.insights,
    Icon: TrendIcon,
    FillIcon: TrendFillIcon,
    fillDirection: "right",
  },
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

  const { Icon, FillIcon, fillDirection } = tab;

  useEffect(() => {
    const target = active ? 1 : 0;
    fill.set(reducedMotion ? target : withTiming(target, { duration: FILL_DURATION }));
  }, [active, reducedMotion, fill]);

  // Directional fill-rise: the filled twin is revealed through a clip window
  // that grows bottom-up (tray/mountain/agenda) or left-to-right (trend).
  const maskStyle = useAnimatedStyle(() =>
    fillDirection === "right"
      ? { width: fill.value * ICON_SIZE }
      : { height: fill.value * ICON_SIZE }
  );

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
          <Icon color={active ? colors.accent : colors.textMuted} size={ICON_SIZE} />
          <Animated.View
            pointerEvents="none"
            style={[
              styles.fillMask,
              fillDirection === "right" ? styles.fillMaskRight : styles.fillMaskUp,
              maskStyle,
            ]}
          >
            <View style={fillDirection === "right" ? styles.fillInnerRight : styles.fillInnerUp}>
              <FillIcon color={colors.accent} size={ICON_SIZE} />
            </View>
          </Animated.View>
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
  fillMask: {
    position: "absolute",
    overflow: "hidden",
  },
  fillMaskUp: {
    left: 0,
    right: 0,
    bottom: 0,
  },
  fillMaskRight: {
    left: 0,
    top: 0,
    bottom: 0,
  },
  fillInnerUp: {
    position: "absolute",
    left: 0,
    bottom: 0,
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  fillInnerRight: {
    position: "absolute",
    left: 0,
    top: 0,
    width: ICON_SIZE,
    height: ICON_SIZE,
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
    width: 56,
    height: 40,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
  captureBtn: {
    width: 56,
    height: 40,
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
