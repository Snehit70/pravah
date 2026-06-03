import { memo, useCallback, type JSX } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Line, Path, Rect } from "react-native-svg";
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

type IconProps = { color: string; size?: number };

// ── Icons ──────────────────────────────────────────────────────────────
// Ported 1:1 from Lucide (stroke-width 2, round caps/joins). `currentColor`
// maps to the `color` prop so active/inactive tint is a single value.

const STROKE = 2.15;

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
      <Path d="M4 8.5c0-1.38 1.12-2.5 2.5-2.5h11C18.88 6 20 7.12 20 8.5V18c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2V8.5Z" />
      <Path d="M4 13h4.4c.38 0 .74.18.97.49l1.26 1.68c.23.31.59.49.97.49h.8c.38 0 .74-.18.97-.49l1.26-1.68c.23-.31.59-.49.97-.49H20" />
    </Svg>
  );
}

function CalendarIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...svgProps(color, size)}>
      <Rect width={16} height={15} x={4} y={5} rx={3} />
      <Line x1={8} y1={3.5} x2={8} y2={7} />
      <Line x1={16} y1={3.5} x2={16} y2={7} />
      <Line x1={4} y1={10} x2={20} y2={10} />
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

function FlagIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...svgProps(color, size)}>
      <Line x1={6.5} y1={4} x2={6.5} y2={20} />
      <Path d="M6.5 5.5h9.75l-1.75 3.5 1.75 3.5H6.5" />
    </Svg>
  );
}

function BarsIcon({ color, size = 24 }: IconProps) {
  return (
    <Svg {...svgProps(color, size)}>
      <Line x1={6} y1={19} x2={6} y2={11} />
      <Line x1={12} y1={19} x2={12} y2={7} />
      <Line x1={18} y1={19} x2={18} y2={4.5} />
    </Svg>
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────

const NAV_TABS: { key: TabKey; label: string; Icon: (p: IconProps) => JSX.Element }[] = [
  { key: "inbox", label: "Inbox", Icon: InboxIcon },
  { key: "timeline", label: "Timeline", Icon: CalendarIcon },
  { key: "goals", label: "Goals", Icon: FlagIcon },
  { key: "insights", label: "Progress", Icon: BarsIcon },
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
        style={({ pressed }) => [
          styles.tabItem,
          selected && styles.tabItemSelected,
          pressed && styles.pressed,
        ]}
        hitSlop={{ top: 12, bottom: 12, left: 0, right: 0 }}
        accessibilityRole="tab"
        accessibilityState={{ selected }}
        accessibilityLabel={tab.label}
      >
        <Icon color={selected ? colors.accent : colors.textSecondary} size={22} />
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
            canCapture && styles.captureEnabled,
            pressed && styles.pressed,
          ]}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Capture a new task"
        >
          <PlusIcon color={colors.textPrimary} size={22} />
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
    gap: spacing.sm,
  },
  tabItem: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
  },
  tabItemSelected: {
    backgroundColor: colors.accentDim,
    borderWidth: 1,
    borderColor: colors.accentSoft,
  },
  captureItem: {
    flex: 1,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
  },
  captureEnabled: {
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accentHover,
    ...shadow.glow,
  },
  captureDisabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.6,
  },
});
