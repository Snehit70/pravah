/**
 * TimelineDayStrip — week navigator pieces for the comfortable-mode carousel
 * (ADR-0009).
 *
 * Two embeddable parts:
 * - `DayStripTrigger` — collapsed date row (accordion handle). Lives in the
 *   day-card header where the old "Wed · Sep 23" subtitle was.
 * - `DayStripWeek` — expanded Sunday–Saturday week: tappable cells jump to
 *   cards, presence dots mark days with tasks, accent squircle glides with
 *   carousel scroll. Renders under the card header; jump or collapse re-closes.
 *
 * `TimelineDayStrip` composes both for standalone lane use (tests / fallback).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { ReactNode } from "react";
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
import { ChevronDownIcon } from "./UiIcons";

type WeekNavSharedProps = {
  cards: DayCarouselCard[];
  /** Index of the currently viewed card, or null before one is adopted. */
  currentIndex: number | null;
  today: string;
  /** Carousel scroll offset mirrored to the UI thread — drives the marker glide. */
  scrollX: SharedValue<number>;
  /** Carousel snap interval (card width + gap) — maps card index to scroll offset. */
  interval: number;
  /** Disables animated week transitions when reduced motion is preferred. */
  reducedMotion: boolean;
  onJumpToCard: (index: number) => void;
};

type DayStripTriggerProps = {
  /** Label under the card title, e.g. "Wed · Sep 23". */
  label: string;
  open?: boolean;
  onPress: () => void;
};

type DayStripWeekProps = WeekNavSharedProps & {
  /** Show the collapse chevron under the week (embedded accordion). */
  onCollapse?: () => void;
};

const LANE_HEIGHT = 56;
const MARKER_HEIGHT = 46;
const TRIGGER_HEIGHT = 28;

export function DayStripTrigger({ label, open = false, onPress }: DayStripTriggerProps) {
  const displayLabel = label.replace(" · ", ", ");
  // Static rotate string — withTiming outside a worklet serializes to {} and
  // crashes RN ("Transform with key of rotate must be a string").
  const chevronStyle = { transform: [{ rotate: open ? "180deg" : "0deg" }] } as const;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${open ? "Hide" : "Show"} week navigator. ${displayLabel}.`}
      accessibilityState={{ expanded: open }}
      style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
    >
      <Text style={styles.triggerLabel}>{displayLabel}</Text>
      <Animated.View style={chevronStyle}>
        <ChevronDownIcon color={colors.textMuted} size={15} strokeWidth={1.9} />
      </Animated.View>
    </Pressable>
  );
}

/** Expanded week grid. Parent places this under the card header. */
export function DayStripWeek({
  cards,
  currentIndex,
  today,
  scrollX,
  interval,
  reducedMotion,
  onJumpToCard,
  onCollapse,
}: DayStripWeekProps) {
  // Measure the row itself — the strip sits inside an ~85%-width carousel
  // card, so a window-based cell width drifts the marker off the active day.
  const [rowWidth, setRowWidth] = useState(0);
  const cellWidth = rowWidth > 0 ? rowWidth / 7 : 0;

  const week = useMemo(
    () => buildDayStrip({ cards, currentIndex, today }),
    [cards, currentIndex, today]
  );

  const glide = useMemo(() => {
    const inputs: number[] = [];
    const outputs: number[] = [];
    week?.cells.forEach((cell, slot) => {
      if (cell.cardIndex != null) {
        inputs.push(cell.cardIndex * interval);
        outputs.push(slot * cellWidth);
      }
    });
    if (inputs.length === 1) {
      return { inputs: [inputs[0] - 1, inputs[0]], outputs: [outputs[0], outputs[0]] };
    }
    return { inputs, outputs };
  }, [week, interval, cellWidth]);

  const hasActiveCell = week?.cells.some((cell) => cell.isActive) ?? false;
  const markerStyle = useAnimatedStyle(() => {
    if (cellWidth <= 0 || glide.inputs.length < 2) return { opacity: 0 };
    return {
      opacity: hasActiveCell ? 1 : 0,
      transform: [
        {
          translateX: interpolate(scrollX.value, glide.inputs, glide.outputs, "clamp"),
        },
      ],
    };
  });

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

  if (!week) return null;

  return (
    <View>
      <View style={styles.lane}>
        <Animated.View
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
          style={[styles.week, dipStyle]}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.markerGlide, { width: cellWidth || 1 }, markerStyle]}
          >
            <View style={[styles.markerGlowOuter, { width: (cellWidth || 1) + 8 }]} />
            <View style={[styles.markerGlowInner, { width: (cellWidth || 1) - 2 }]} />
            <View style={[styles.markerPill, { width: (cellWidth || 1) - 10 }]} />
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
      {onCollapse ? (
        <Pressable
          onPress={onCollapse}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Hide week navigator"
          accessibilityState={{ expanded: true }}
          style={({ pressed }) => [styles.collapseHit, pressed && styles.triggerPressed]}
        >
          <Animated.View style={[styles.collapseChevron]}>
            <ChevronDownIcon color={colors.textMuted} size={16} strokeWidth={1.9} />
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  );
}

type TimelineDayStripProps = WeekNavSharedProps & {
  /**
   * Open state. Omit for uncontrolled (open by default — standalone lane);
   * pass `false` when the parent owns a closed accordion.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

/**
 * Standalone lane composition (tests, fallback). Controlled when `open` is
 * provided; otherwise defaults open so the week is visible without a press.
 */
export function TimelineDayStrip({
  open: openProp,
  onOpenChange,
  ...weekProps
}: TimelineDayStripProps) {
  const [internalOpen, setInternalOpen] = useState(true);
  const open = openProp ?? internalOpen;
  const { cards, currentIndex, today } = weekProps;

  const week = useMemo(
    () => buildDayStrip({ cards, currentIndex, today }),
    [cards, currentIndex, today]
  );
  const activeCell =
    week?.cells.find((cell) => cell.isActive) ??
    week?.cells.find((cell) => cell.isToday) ??
    week?.cells.find((cell) => cell.cardIndex != null) ??
    null;
  const label = activeCell ? weekdayDate(activeCell.dateKey) : weekdayDate(today);

  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  if (!week) {
    return (
      <View style={styles.lane}>
        <Text style={styles.triggerLabel}>{label}</Text>
      </View>
    );
  }

  if (!open) {
    return (
      <View style={styles.standaloneTriggerWrap}>
        <DayStripTrigger
          label={label}
          open={false}
          onPress={() => setOpen(true)}
        />
      </View>
    );
  }

  return (
    <View>
      <DayStripWeek
        {...weekProps}
        onJumpToCard={(index) => {
          weekProps.onJumpToCard(index);
          if (onOpenChange) setOpen(false);
        }}
        onCollapse={onOpenChange ? () => setOpen(false) : undefined}
      />
    </View>
  );
}

const styles = createThemedStyles({
  standaloneTriggerWrap: {
    paddingHorizontal: spacing.lg,
    height: TRIGGER_HEIGHT + 8,
    justifyContent: "center",
  },
  trigger: {
    minHeight: TRIGGER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingRight: spacing.sm,
  },
  triggerPressed: {
    opacity: 0.6,
  },
  triggerLabel: {
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  collapseHit: {
    alignSelf: "center",
    width: 36,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  collapseChevron: {
    transform: [{ rotate: "180deg" }],
  },
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
  dayNumberToday: {
    color: colors.accent,
    fontFamily: fonts.sansBold,
  },
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
