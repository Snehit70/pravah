/**
 * TimelineDayStrip — the week navigator above the comfortable-mode carousel
 * (ADR-0009). A Sunday–Saturday calendar week: days that hold a card are
 * reachable (tap to jump), days without one are dimmed for orientation. A
 * presence dot marks days with live tasks; a solid accent squircle marks the
 * currently viewed day and glides between cells as a pure function of the
 * carousel's scroll position. The week slides to follow the viewed card, with
 * a quick dip at week boundaries. When the visible week is not today's, a
 * compact "back to today" affordance appears at the left.
 *
 * The strip replaces the old "‹ Today" chip lane: the chip was a one-destination
 * navigator, the strip is its n-destination generalization.
 */

import { useEffect, useMemo, useRef } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { colors, fonts, radii, spacing } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { weekdayDate } from "../lib/dates";
import { buildDayStrip } from "../lib/timelineDayStrip";
import type { DayCarouselCard } from "../lib/timelineCarousel";

type TimelineDayStripProps = {
  cards: DayCarouselCard[];
  /** Index of the currently viewed card, or null before one is adopted. */
  currentIndex: number | null;
  today: string;
  /** Carousel scroll offset mirrored to the UI thread — drives the marker glide. */
  scrollX: SharedValue<number>;
  /** Carousel snap interval (card width + gap) — maps card index to scroll offset. */
  interval: number;
  /** The card the "back to today" affordance jumps to. */
  reducedMotion: boolean;
  onJumpToCard: (index: number) => void;
};

const LANE_HEIGHT = 56;
const MARKER_HEIGHT = 46;

export function TimelineDayStrip({
  cards,
  currentIndex,
  today,
  scrollX,
  interval,
  reducedMotion,
  onJumpToCard,
}: TimelineDayStripProps) {
  const { width: windowWidth } = useWindowDimensions();
  const cellWidth = (windowWidth - 2 * spacing.lg) / 7;

  const week = useMemo(
    () => buildDayStrip({ cards, currentIndex, today }),
    [cards, currentIndex, today]
  );

  // Marker glide path: carousel scroll offsets of the cards in this week map to
  // their cell x-positions. interpolate needs a monotonically increasing input
  // of length ≥ 2 — pad a single-card week to a constant position.
  const glide = useMemo(() => {
    const inputs: number[] = [];
    const outputs: number[] = [];
    week?.cells.forEach((cell, slot) => {
      if (cell.cardIndex != null) {
        inputs.push(cell.cardIndex * interval);
        outputs.push(slot * cellWidth);
      }
    });
    if (inputs.length === 1) return { inputs: [inputs[0] - 1, inputs[0]], outputs: [outputs[0], outputs[0]] };
    return { inputs, outputs };
  }, [week, interval, cellWidth]);

  const hasActiveCell = week?.cells.some((cell) => cell.isActive) ?? false;
  const markerStyle = useAnimatedStyle(() => {
    if (glide.inputs.length < 2) return { opacity: 0 };
    return {
      opacity: hasActiveCell ? 1 : 0,
      transform: [
        {
          translateX: interpolate(scrollX.value, glide.inputs, glide.outputs, "clamp"),
        },
      ],
    };
  });

  // Quick dip when the week changes, masking the marker's jump across the
  // boundary. First mount and reduced motion place instantly.
  const weekKey = week?.cells[0]?.dateKey ?? null;
  const dipOpacity = useSharedValue(1);
  const prevWeekKey = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevWeekKey.current;
    prevWeekKey.current = weekKey;
    if (prev === null || prev === weekKey || reducedMotion) return;
    dipOpacity.set(
      withSequence(withTiming(0.35, { duration: 90 }), withTiming(1, { duration: 120 }))
    );
  }, [weekKey, reducedMotion, dipOpacity]);
  const dipStyle = useAnimatedStyle(() => ({ opacity: dipOpacity.value }));

  if (!week) return <View style={styles.lane} />;

  return (
    <View style={styles.lane}>
      <Animated.View style={[styles.week, dipStyle]}>
        <Animated.View
          pointerEvents="none"
          style={[styles.markerGlide, { width: cellWidth }, markerStyle]}
        >
          <View style={[styles.markerGlowOuter, { width: cellWidth + 8 }]} />
          <View style={[styles.markerGlowInner, { width: cellWidth - 2 }]} />
          <View style={[styles.markerPill, { width: cellWidth - 10 }]} />
        </Animated.View>
        {week.cells.map((cell) => {
          const tappable = cell.cardIndex != null;
          return (
            <Pressable
              key={cell.dateKey}
              disabled={!tappable}
              onPress={tappable ? () => onJumpToCard(cell.cardIndex as number) : undefined}
              style={({ pressed }) => [styles.cell, pressed && tappable && styles.cellPressed]}
              accessibilityRole={tappable ? "button" : undefined}
              accessibilityState={tappable ? { selected: cell.isActive } : undefined}
              accessibilityLabel={tappable ? `Jump to ${weekdayDate(cell.dateKey)}` : undefined}
            >
              <Text
                style={[
                  styles.weekdayLetter,
                  cell.isToday && !cell.isActive && styles.weekdayLetterToday,
                  cell.isActive && styles.textActive,
                  !tappable && styles.textDim,
                ]}
              >
                {cell.weekdayLetter}
              </Text>
              <Text
                style={[
                  styles.dayNumber,
                  cell.isToday && !cell.isActive && styles.dayNumberToday,
                  cell.isActive && styles.dayNumberActive,
                  !tappable && styles.textDim,
                ]}
              >
                {cell.dayOfMonth}
              </Text>
              <View style={styles.dotSlot}>
                {cell.hasTasks ? (
                  <View
                    style={[styles.dot, cell.isActive && { backgroundColor: colors.textInverse }]}
                  />
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </Animated.View>

    </View>
  );
}

const styles = createThemedStyles({
  lane: {
    height: LANE_HEIGHT,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  week: {
    flexDirection: "row",
    alignItems: "stretch",
    height: LANE_HEIGHT,
  },
  // Active marker: a solid accent squircle wrapped in two translucent accent
  // halos for a soft glow. A full-cell-width box that centers its children, so
  // the glide is a plain slot * cellWidth translateX. Glides on the UI thread.
  markerGlide: {
    position: "absolute",
    left: 0,
    top: 0,
    height: LANE_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  markerGlowOuter: {
    position: "absolute",
    height: MARKER_HEIGHT + 14,
    borderRadius: radii.xl,
    borderCurve: "continuous",
    backgroundColor: colors.accentDim,
  },
  markerGlowInner: {
    position: "absolute",
    height: MARKER_HEIGHT + 6,
    borderRadius: radii.lg + 2,
    borderCurve: "continuous",
    backgroundColor: colors.accentSoft,
  },
  markerPill: {
    height: MARKER_HEIGHT,
    borderRadius: radii.lg,
    borderCurve: "continuous",
    backgroundColor: colors.accent,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  cellPressed: {
    opacity: 0.55,
  },
  weekdayLetter: {
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.4,
  },
  weekdayLetterToday: {
    color: colors.accent,
  },
  dayNumber: {
    color: colors.textPrimary,
    fontFamily: fonts.sansSemibold,
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  // Today (when not the viewed day) reads as accent so "where today is" stays
  // visible alongside "where I am" (the pill).
  dayNumberToday: {
    color: colors.accent,
    fontFamily: fonts.sansBold,
  },
  // The viewed day sits a touch larger and bolder inside the pill.
  dayNumberActive: {
    color: colors.textInverse,
    fontFamily: fonts.sansBold,
    fontSize: 17,
    lineHeight: 21,
  },
  textActive: {
    color: colors.textInverse,
  },
  textDim: {
    color: colors.textDim,
    opacity: 0.4,
  },
  dotSlot: {
    height: 5,
    justifyContent: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
  },
});
