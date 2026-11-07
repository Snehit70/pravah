import { useEffect } from "react";
import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type DimensionValue,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors, fonts, motion, radii, shadow, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { CalendarIcon, ChevronDownIcon } from "./UiIcons";

function SkeletonPulse({ children }: { children: ReactNode }) {
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0.55);

  useEffect(() => {
    if (reducedMotion) {
      // Hold a static, slightly dimmed state. No translate, no pulse — the
      // structural skeleton itself is enough signal that data is loading.
      opacity.value = withTiming(0.7, { duration: motion.duration.fast });
      return;
    }
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.82, {
          duration: motion.duration.deliberate,
          easing: Easing.bezier(...motion.easing.outQuart),
        }),
        withTiming(0.55, {
          duration: motion.duration.deliberate,
          easing: Easing.bezier(...motion.easing.inOutQuart),
        })
      ),
      -1,
      true
    );
  }, [opacity, reducedMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}

function Block({
  width,
  height = 12,
  fill,
}: {
  width: DimensionValue;
  height?: number;
  fill?: boolean;
}) {
  return <View style={[styles.block, fill && styles.blockFill, { width, height }]} />;
}

// Mirrors the real timeline card and its shared "Today" header. The date
// strings come from the device clock, so the skeleton renders them as real
// text: the header does not change when the data arrives.
const CAROUSEL_CARD_RATIO = 0.85; // TimelineDayCarousel CARD_WIDTH_RATIO
const CAROUSEL_CARD_GAP = spacing.md; // TimelineDayCarousel CARD_GAP

function SlimCardRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <View key={`slim-skeleton-${index}`} style={styles.slimRow}>
          <View style={styles.slimCheck} />
          <View style={styles.slimBody}>
            <Block fill width={index % 2 === 0 ? "70%" : "58%"} height={14} />
            <Block fill width={index % 2 === 0 ? "38%" : "46%"} height={10} />
          </View>
          <Block fill width={8} height={14} />
        </View>
      ))}
    </>
  );
}

function TimelineCarouselSkeleton({ todayDate }: { todayDate?: string }) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.round(windowWidth * CAROUSEL_CARD_RATIO);
  return (
    <View style={styles.carouselStage}>
      <View style={styles.carouselTrack}>
        <View style={[styles.timelineCard, styles.timelineCardToday, { width: cardWidth }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardHeaderText}>
              <View style={styles.cardLabelRow}>
                <CalendarIcon color={colors.accent} size={18} strokeWidth={1.8} />
                {todayDate ? (
                  <Text style={styles.cardLabelToday}>Today</Text>
                ) : (
                  <Block fill width={64} height={20} />
                )}
              </View>
              {todayDate ? (
                <View style={styles.cardTrigger}>
                  <Text style={styles.cardTriggerLabel}>{todayDate.replace(" · ", ", ")}</Text>
                  <ChevronDownIcon color={colors.textMuted} size={15} strokeWidth={1.9} />
                </View>
              ) : (
                <Block fill width={96} height={12} />
              )}
            </View>
            <View style={styles.cardProgress}>
              <Block fill width={72} height={22} />
              <Block fill width={124} height={6} />
            </View>
          </View>
          <View style={styles.cardRows}>
            <SlimCardRows count={3} />
          </View>
        </View>
        <View style={[styles.timelineCard, { width: cardWidth }]}>
          <View style={styles.cardRows}>
            <SlimCardRows count={2} />
          </View>
        </View>
      </View>
    </View>
  );
}

// Mirrors TimelineSectionHeader for a non-today day: weekday over date, count right.
function TimelineSectionHeaderSkeleton() {
  return (
    <View style={styles.sectionSkeletonWrap}>
      <View style={styles.sectionSkeletonLine}>
        <View style={styles.sectionSkeletonLandmark}>
          <Block fill width={84} height={18} />
          <Block fill width={56} height={11} />
        </View>
        <Block fill width={52} height={11} />
      </View>
    </View>
  );
}

function TimelineListSkeleton({ todayDate }: { todayDate?: string }) {
  return (
    <View style={styles.listTimelineWrap}>
      <View style={styles.todayHeader}>
        <View style={styles.todayHeaderLine}>
          <View>
            <Text style={styles.todayTitle}>Today</Text>
            {todayDate ? (
              <Text style={styles.todayDate}>{todayDate}</Text>
            ) : (
              <Block fill width={96} height={12} />
            )}
          </View>
          <Block fill width={90} height={14} />
        </View>
        <Block fill width="100%" height={6} />
      </View>
      <SlimCardRows count={2} />
      <TimelineSectionHeaderSkeleton />
      <SlimCardRows count={2} />
      <TimelineSectionHeaderSkeleton />
      <SlimCardRows count={1} />
    </View>
  );
}

function InboxRowSkeleton({ titleWidth }: { titleWidth: DimensionValue }) {
  // Mirrors InboxTaskRow: leading tile, single-line title, schedule slot.
  return (
    <View style={styles.inboxRow}>
      <View style={styles.inboxTile} />
      <View style={styles.inboxRowBody}>
        <Block fill width={titleWidth} height={14} />
      </View>
      <View style={styles.inboxScheduleSlot} />
    </View>
  );
}

function InboxListSkeleton() {
  return (
    <View style={styles.inboxListWrap}>
      <View style={styles.inboxSearchWrap}>
        <View style={styles.inboxSearchRow}>
          <View style={styles.searchField} />
          <View style={styles.inboxSelectSlot}>
            <Block fill width={50} height={12} />
          </View>
        </View>
      </View>
      <View style={styles.inboxGroupHeader}>
        <Block fill width={92} height={16} />
        <Block fill width={22} height={12} />
      </View>
      <InboxRowSkeleton titleWidth="72%" />
      <InboxRowSkeleton titleWidth="58%" />
      <InboxRowSkeleton titleWidth="64%" />
      <View style={styles.inboxGroupHeader}>
        <Block fill width={70} height={16} />
        <Block fill width={22} height={12} />
      </View>
      <InboxRowSkeleton titleWidth="66%" />
      <InboxRowSkeleton titleWidth="48%" />
    </View>
  );
}

// Mirrors GoalsScreen goalCard > goalRow: tile, title, thin progress, meta line.
function GoalCardSkeleton({ titleWidth }: { titleWidth: DimensionValue }) {
  return (
    <View style={styles.goalCardSkeleton}>
      <View style={styles.goalRowSkeleton}>
        <View style={styles.goalTileSkeleton} />
        <View style={styles.goalBodySkeleton}>
          <View style={styles.goalTitleSkeletonLine}>
            <Block fill width={titleWidth} height={16} />
          </View>
          <Block fill width="100%" height={4} />
          <View style={styles.goalMetaSkeleton}>
            <Block fill width={64} height={10} />
            <Block fill width={52} height={10} />
          </View>
        </View>
      </View>
    </View>
  );
}

function PageSkeleton({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={style}>
      <Text accessibilityLiveRegion="polite" style={styles.loadingAnnouncement}>
        Loading {label}
      </Text>
      <SkeletonPulse>
        <View
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {children}
        </View>
      </SkeletonPulse>
    </View>
  );
}

function TaskRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <View key={`task-skeleton-${index}`} style={styles.taskRow}>
          <View style={styles.priorityRail} />
          <View style={styles.taskCopy}>
            <Block width={index % 2 === 0 ? "74%" : "61%"} height={14} />
            <Block width={index % 3 === 0 ? "48%" : "36%"} height={10} />
          </View>
          <View style={styles.trailingBlock} />
        </View>
      ))}
    </>
  );
}

export function TaskListSkeleton({
  variant,
  layout = "list",
  todayDate,
}: {
  variant: "inbox" | "timeline" | "completed";
  layout?: "list" | "carousel";
  /** Weekday date for the Today header, e.g. "Sat, Nov 7". */
  todayDate?: string;
}) {
  if (variant === "timeline") {
    return (
      <PageSkeleton label="Timeline">
        {layout === "carousel" ? (
          <TimelineCarouselSkeleton todayDate={todayDate} />
        ) : (
          <TimelineListSkeleton todayDate={todayDate} />
        )}
      </PageSkeleton>
    );
  }

  if (variant === "inbox") {
    return (
      <PageSkeleton label="Inbox">
        <InboxListSkeleton />
      </PageSkeleton>
    );
  }

  // The Completed screen is not mounted in the app today; generic rows only.
  return (
    <PageSkeleton label="completed tasks">
      <View style={styles.listWrap}>
        <TaskRows count={4} />
      </View>
    </PageSkeleton>
  );
}

/** Trailing placeholder while dates after the near window load. */
export function LaterDatesSkeleton({ layout = "list" }: { layout?: "list" | "carousel" }) {
  return (
    <PageSkeleton label="later dates">
      {layout === "carousel" ? (
        <View style={styles.carouselLaterCard}>
          <View style={styles.carouselCardHeader}>
            <Block width={92} height={16} />
            <Block width={42} height={10} />
          </View>
          <SlimCardRows count={3} />
        </View>
      ) : (
        <View>
          <TimelineSectionHeaderSkeleton />
          <SlimCardRows count={2} />
        </View>
      )}
    </PageSkeleton>
  );
}

export function GoalsPageSkeleton() {
  return (
    <PageSkeleton label="Goals">
      <View>
        <View style={styles.goalsSearchWrap}>
          <View style={styles.searchField} />
        </View>
        <View style={styles.goalsListHeader}>
          <Block width={82} height={12} />
        </View>
        <GoalCardSkeleton titleWidth="70%" />
        <GoalCardSkeleton titleWidth="56%" />
        <GoalCardSkeleton titleWidth="64%" />
        <GoalCardSkeleton titleWidth="48%" />
      </View>
    </PageSkeleton>
  );
}

function ChartLineSkeleton({
  width = "100%",
  height = 148,
}: {
  width?: DimensionValue;
  height?: number;
}) {
  return (
    <View style={[styles.chartLineArea, { height }]}>
      <View style={styles.chartAxis}>
        <Block width={18} height={9} />
        <Block width={18} height={9} />
        <Block width={18} height={9} />
      </View>
      <View style={styles.chartPlot}>
        <View style={styles.chartGridLine} />
        <View style={styles.chartGridLine} />
        <View style={[styles.chartLine, { width }]} />
      </View>
    </View>
  );
}

function SectionSkeletonHeader({
  eyebrowWidth,
  captionWidth,
  right,
}: {
  eyebrowWidth: number;
  captionWidth?: number;
  right?: ReactNode;
}) {
  // Mirrors InsightsScreen SectionHeader.
  return (
    <View style={styles.sectionSkeletonHeader}>
      <View style={styles.sectionSkeletonRow}>
        <Block fill width={eyebrowWidth} height={11} />
        {right}
      </View>
      {captionWidth ? <Block fill width={captionWidth} height={12} /> : null}
    </View>
  );
}

function RhythmSkeleton() {
  return (
    <View style={styles.rhythmCard}>
      <View style={styles.rhythmControls}>
        <Block width="62%" height={34} />
        <Block width="30%" height={34} />
      </View>
      <ChartLineSkeleton />
      <View style={styles.rhythmFooter}>
        <Block width={126} height={12} />
        <Block width={76} height={16} />
      </View>
    </View>
  );
}

// Mirrors InsightsScreen's always-on sections. Goals-in-motion and Task history
// depend on loaded data, so they are not reserved here.
export function ProgressPageSkeleton() {
  return (
    <PageSkeleton label="Progress">
      <View style={styles.progressWrap}>
        <View>
          <SectionSkeletonHeader
            eyebrowWidth={118}
            right={<Block fill width={84} height={24} />}
          />
          <View style={styles.heroCard}>
            <Block fill width={142} height={26} />
            <Block fill width={180} height={12} />
            <ChartLineSkeleton height={168} />
          </View>
        </View>

        <View>
          <SectionSkeletonHeader eyebrowWidth={58} captionWidth={166} />
          <RhythmSkeleton />
        </View>

        <View>
          <SectionSkeletonHeader eyebrowWidth={62} captionWidth={194} />
          <View style={styles.heatmapCard}>
            <View style={styles.heatmapMonthRow}>
              {Array.from({ length: 4 }, (_, index) => (
                <Block key={`heatmap-month-${index}`} fill width={32} height={10} />
              ))}
            </View>
            <View style={styles.heatmapRows}>
              {Array.from({ length: 7 }, (_, row) => (
                <View key={`heatmap-row-${row}`} style={styles.heatmapRow}>
                  {Array.from({ length: 14 }, (_, cell) => (
                    <View key={`heatmap-cell-${row}-${cell}`} style={styles.heatmapCell} />
                  ))}
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>
    </PageSkeleton>
  );
}

// Mirrors KairoSettingsSection: the default-provider header comes first, then the
// editor for the selected provider. The editor rows below are placeholders only.
export function KairoSettingsSkeleton() {
  return (
    <SkeletonPulse>
      <View style={styles.settingsWrap}>
        <View style={styles.kairoDefaultHeader}>
          <View style={styles.kairoProviderTile} />
          <View style={styles.kairoDefaultCopy}>
            <Block fill width={124} height={16} />
            <Block fill width={150} height={12} />
            <Block fill width={210} height={11} />
          </View>
          <Block fill width={18} height={18} />
        </View>

        <View style={styles.kairoEditorStack}>
          <Block width={116} height={16} />
          <Block width="78%" height={11} />
          <Block width={88} height={10} />

          <View style={styles.providerRow}>
            <View style={styles.chip} />
            <View style={styles.chip} />
          </View>

          <View style={styles.input} />
          <View style={styles.input} />
          <View style={styles.input} />

          <View style={styles.actionsRow}>
            <Block width={40} height={10} />
            <Block width={42} height={10} />
          </View>
        </View>
      </View>
    </SkeletonPulse>
  );
}

const styles = createThemedStyles({
  loadingAnnouncement: {
    position: "absolute",
    left: -10000,
    top: 0,
    width: 1,
    height: 1,
  },
  block: {
    borderRadius: radii.sm,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  blockFill: {
    backgroundColor: colors.borderSubtle,
    borderWidth: 0,
  },
  searchField: {
    flex: 1,
    minHeight: 38,
    borderRadius: radii.md,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  inboxListWrap: {
    paddingTop: spacing.md,
  },
  inboxSearchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  inboxSearchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  inboxSelectSlot: {
    minWidth: 78,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  inboxGroupHeader: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginVertical: 3,
    paddingVertical: 7,
    paddingHorizontal: 11,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  inboxTile: {
    width: 30,
    height: 30,
    borderRadius: 9,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  inboxRowBody: {
    flex: 1,
    minWidth: 0,
  },
  inboxScheduleSlot: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  goalsSearchWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  goalsListHeader: {
    minHeight: 44,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  goalCardSkeleton: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    overflow: "hidden",
  },
  goalRowSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  goalTileSkeleton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  goalBodySkeleton: {
    flex: 1,
    minWidth: 0,
  },
  goalTitleSkeletonLine: {
    paddingBottom: 7,
  },
  goalMetaSkeleton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: 6,
  },
  carouselStage: {
    overflow: "hidden",
    paddingTop: spacing.md,
  },
  carouselTrack: {
    flexDirection: "row",
    paddingLeft: spacing.lg,
    gap: CAROUSEL_CARD_GAP,
  },
  timelineCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
    ...shadow.sm,
  },
  timelineCardToday: {
    borderColor: colors.accentSoft,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  cardHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  cardLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  cardLabelToday: {
    color: colors.accent,
    fontFamily: fonts.sansSemibold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.35,
  },
  // Matches DayStripTrigger in TimelineDayStrip.tsx.
  cardTrigger: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    alignSelf: "flex-start",
    paddingVertical: 2,
    paddingRight: spacing.sm,
  },
  cardTriggerLabel: {
    color: colors.textMuted,
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
  },
  cardProgress: {
    minWidth: 124,
    alignItems: "flex-end",
    gap: spacing.xs,
    paddingTop: 4,
  },
  cardRows: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  slimRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgFloating,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  slimCheck: {
    width: 24,
    height: 24,
    marginHorizontal: 10,
    borderRadius: 7,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderColor: colors.borderControl,
    backgroundColor: colors.bgSurface,
  },
  slimBody: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  listTimelineWrap: {
    paddingTop: spacing.md,
  },
  todayHeader: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  todayHeaderLine: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  todayTitle: {
    color: colors.accent,
    ...typography.headline,
  },
  todayDate: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    marginTop: 2,
  },
  listWrap: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.md,
    paddingVertical: spacing.rowY,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCardGlass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  trailingBlock: {
    width: 22,
    height: 22,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  priorityRail: {
    width: 3,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
  },
  taskCopy: {
    flex: 1,
    gap: spacing.sm,
    justifyContent: "center",
  },
  carouselLaterCard: {
    flex: 1,
    padding: spacing.md,
    gap: spacing.md,
  },
  carouselCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  progressWrap: {
    paddingTop: spacing.md,
    gap: spacing.section,
  },


  heroCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  chartLineArea: {
    minHeight: 148,
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  chartAxis: {
    width: 24,
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingVertical: spacing.sm,
  },
  chartPlot: {
    flex: 1,
    justifyContent: "space-between",
    position: "relative",
    paddingVertical: spacing.sm,
  },
  chartGridLine: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
    backgroundColor: colors.borderSubtle,
  },
  chartLine: {
    position: "absolute",
    left: "8%",
    top: "42%",
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
    transform: [{ rotate: "-8deg" }],
  },
  rhythmCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  rhythmControls: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  rhythmFooter: {
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  heatmapCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: "hidden",
    borderRadius: radii.xl,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  heatmapMonthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    height: 16,
  },
  heatmapRows: {
    gap: 4,
  },
  sectionSkeletonWrap: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  sectionSkeletonLine: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionSkeletonLandmark: {
    gap: 1,
  },
  sectionSkeletonHeader: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: 2,
  },
  sectionSkeletonRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    minHeight: 32,
  },
  heatmapRow: {
    flexDirection: "row",
    gap: 4,
  },
  heatmapCell: {
    width: 18,
    height: 18,
    borderRadius: 4,
    backgroundColor: colors.bgCardGlass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  settingsWrap: {
    gap: spacing.lg,
  },
  kairoDefaultHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
  },
  kairoProviderTile: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  kairoDefaultCopy: {
    flex: 1,
    gap: 2,
  },
  kairoEditorStack: {
    gap: spacing.sm,
  },
  providerRow: {
    flexDirection: "row",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  chip: {
    width: 96,
    height: 32,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  input: {
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  actionsRow: {
    flexDirection: "row",
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
});
