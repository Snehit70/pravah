/**
 * TimelineLayoutToggle — icon-only header toggle between the Timeline's two
 * layouts: the compact vertical list and the comfortable day-card carousel.
 *
 * The icon shows the layout you'd switch TO (list mode shows the day-cards
 * glyph, carousel mode shows the list glyph), and the choice persists as the
 * `timelineLayout` user preference. Icons are hand-authored per ADR-0005.
 */

import { Pressable, StyleSheet } from "react-native";
import Svg, { Line, Rect } from "react-native-svg";
import { colors, radii } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { useUserPreferences } from "../hooks/useUserPreferences";

type GlyphProps = { color: string; size?: number };

/** Three full-width rules — the vertical list. */
function ListGlyph({ color, size = 20 }: GlyphProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    >
      <Line x1={4.5} y1={6.5} x2={19.5} y2={6.5} />
      <Line x1={4.5} y1={12} x2={19.5} y2={12} />
      <Line x1={4.5} y1={17.5} x2={19.5} y2={17.5} />
    </Svg>
  );
}

/** One day card with the next card peeking at the trailing edge. */
function DayCardsGlyph({ color, size = 20 }: GlyphProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Rect x={3.5} y={5} width={13} height={14} rx={2.5} />
      <Line x1={20.5} y1={7.5} x2={20.5} y2={16.5} />
    </Svg>
  );
}

export function TimelineLayoutToggle() {
  const { prefs, setPreference } = useUserPreferences();
  const isCarousel = prefs.timelineLayout === "carousel";

  return (
    <Pressable
      onPress={() =>
        void setPreference("timelineLayout", isCarousel ? "list" : "carousel")
      }
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={isCarousel ? "Switch to list" : "Switch to day cards"}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      {isCarousel ? (
        <ListGlyph color={colors.textMuted} />
      ) : (
        <DayCardsGlyph color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = createThemedStyles({
  // Layout, Kairo, and Settings share one compact button grammar in the
  // header: identical footprint, surface, border, and continuous corners.
  wrap: {
    width: 42,
    height: 42,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: radii.lg,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  pressed: {
    opacity: 0.55,
  },
});
