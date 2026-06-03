import { memo, useCallback, type JSX } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Polyline, Rect } from "react-native-svg";
import { haptic } from "../lib/haptic";
import { colors, spacing } from "../theme/tokens";

export type TabKey = "inbox" | "timeline" | "goals" | "insights";

type BottomTabBarProps = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
  onCapture: () => void;
  canCapture?: boolean;
  bottomInset?: number;
};

type IconProps = { color: string; size?: number };

// ── Icons ──────────────────────────────────────────────────────────────
// Ported 1:1 from Lucide (stroke-width 2, round caps/joins). `currentColor`
// maps to the `color` prop so active/inactive tint is a single value.

const STROKE = 2;

function svgProps(color: string, size: number) {
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

function InboxIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...svgProps(color, size)}>
      <Polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <Path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </Svg>
  );
}

function CalendarIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...svgProps(color, size)}>
      <Path d="M8 2v4" />
      <Path d="M16 2v4" />
      <Rect width={18} height={18} x={3} y={4} rx={2} />
      <Path d="M3 10h18" />
    </Svg>
  );
}

function PlusIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...svgProps(color, size)}>
      <Path d="M5 12h14" />
      <Path d="M12 5v14" />
    </Svg>
  );
}

function TargetIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...svgProps(color, size)}>
      <Circle cx={12} cy={12} r={10} />
      <Circle cx={12} cy={12} r={6} />
      <Circle cx={12} cy={12} r={2} />
    </Svg>
  );
}

function TrendingUpIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...svgProps(color, size)}>
      <Path d="M16 7h6v6" />
      <Path d="m22 7-8.5 8.5-5-5L2 17" />
    </Svg>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────

const NAV_TABS: { key: TabKey; label: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { key: "inbox", label: "Inbox", Icon: InboxIcon },
  { key: "timeline", label: "Timeline", Icon: CalendarIcon },
  { key: "goals", label: "Goals", Icon: TargetIcon },
  { key: "insights", label: "Progress", Icon: TrendingUpIcon },
];

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

  const renderTab = (tab: (typeof NAV_TABS)[number]) => {
    const selected = active === tab.key;
    const { Icon } = tab;
    return (
      <Pressable
        key={tab.key}
        onPress={() => handlePress(tab.key)}
        style={({ pressed }) => [styles.tabItem, pressed && styles.pressed]}
        hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={tab.label}
      >
        <Icon color={selected ? colors.textPrimary : colors.textMuted} size={24} />
      </Pressable>
    );
  };

  return (
    <View style={[styles.container, { paddingBottom: bottomInset }]}>
      <View style={styles.bar} accessibilityRole="tablist">
        {renderTab(NAV_TABS[0])}
        {renderTab(NAV_TABS[1])}

        {/* Center capture — the one primary action. Accent tint + center slot
            mark it as a verb, not a destination. */}
        <Pressable
          onPress={() => {
            haptic.medium();
            onCapture();
          }}
          disabled={!canCapture}
          style={({ pressed }) => [
            styles.captureItem,
            !canCapture && styles.captureDisabled,
            pressed && styles.pressed,
          ]}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Capture a new task"
        >
          <PlusIcon color={colors.accent} size={28} />
        </Pressable>

        {renderTab(NAV_TABS[2])}
        {renderTab(NAV_TABS[3])}
      </View>
    </View>
  );
}

export const BottomTabBar = memo(BottomTabBarInner);

const styles = StyleSheet.create({
  // Container draws a single hairline divider on top — no enclosing pill.
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
  },
  tabItem: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  captureItem: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  captureDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.6,
  },
});
