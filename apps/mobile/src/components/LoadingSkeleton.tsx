import { useEffect } from "react";
import type { ReactNode } from "react";
import { StyleSheet, Text, View, type DimensionValue, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors, motion, radii, spacing } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";

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

function Block({ width, height = 12 }: { width: DimensionValue; height?: number }) {
  return <View style={[styles.block, { width, height }]} />;
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

function TaskRows({ count, slim = false }: { count: number; slim?: boolean }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <View key={`task-skeleton-${index}`} style={[styles.taskRow, slim && styles.taskRowSlim]}>
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

function TimelineListSkeleton() {
  return (
    <View style={styles.timelineWrap}>
      <View style={styles.timelineSummary}>
        <Block width={76} height={10} />
        <Block width={28} height={10} />
      </View>
      <Block width={88} height={11} />
      <TaskRows count={2} />
      <View style={styles.timelineSectionGap} />
      <Block width={72} height={11} />
      <TaskRows count={2} />
      <View style={styles.timelineSectionGap} />
      <Block width={104} height={11} />
      <TaskRows count={1} />
    </View>
  );
}

function TimelineCarouselSkeleton() {
  return (
    <View style={styles.carouselWrap}>
      <View style={styles.carouselDateStrip}>
        <Block width={46} height={12} />
        <Block width={46} height={12} />
        <Block width={46} height={12} />
        <Block width={46} height={12} />
      </View>
      <View style={styles.carouselCard}>
        <View style={styles.carouselCardHeader}>
          <Block width={92} height={16} />
          <Block width={42} height={10} />
        </View>
        <TaskRows count={3} slim />
      </View>
    </View>
  );
}

export function TaskListSkeleton({
  variant,
  layout = "list",
}: {
  variant: "inbox" | "timeline" | "completed";
  layout?: "list" | "carousel";
}) {
  if (variant === "timeline") {
    return (
      <PageSkeleton label="Timeline">
        {layout === "carousel" ? <TimelineCarouselSkeleton /> : <TimelineListSkeleton />}
      </PageSkeleton>
    );
  }

  const rows = variant === "completed" ? 4 : 5;

  return (
    <PageSkeleton label={variant === "inbox" ? "Inbox" : "completed tasks"}>
      <View style={styles.listWrap}>
        {variant === "inbox" ? (
          <>
            <View style={styles.inboxGroupHeader}>
              <Block width={92} height={14} />
              <Block width={22} height={10} />
            </View>
            <TaskRows count={2} />
            <View style={styles.inboxGroupGap} />
          </>
        ) : null}
        <TaskRows count={rows} />
      </View>
    </PageSkeleton>
  );
}

function SkeletonCardRows({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <View key={`goal-skeleton-${index}`} style={styles.goalCard}>
          <View style={styles.goalTile} />
          <View style={styles.goalCopy}>
            <Block width={index % 2 === 0 ? "76%" : "62%"} height={15} />
            <View style={styles.goalProgress} />
            <Block width={index % 2 === 0 ? "42%" : "35%"} height={10} />
          </View>
        </View>
      ))}
    </>
  );
}

export function GoalsPageSkeleton() {
  return (
    <PageSkeleton label="Goals">
      <View style={styles.goalsWrap}>
        <View style={styles.goalsHeader}>
          <Block width={64} height={12} />
          <Block width={82} height={12} />
        </View>
        <SkeletonCardRows count={4} />
      </View>
    </PageSkeleton>
  );
}

function ChartLineSkeleton({ width = "100%" }: { width?: DimensionValue }) {
  return (
    <View style={styles.chartLineArea}>
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

export function ProgressPageSkeleton() {
  return (
    <PageSkeleton label="Progress">
      <View style={styles.progressWrap}>
        <View style={styles.progressSectionHeader}>
          <Block width={118} height={11} />
          <Block width={84} height={24} />
        </View>
        <View style={styles.heroCard}>
          <Block width={142} height={26} />
          <Block width={180} height={12} />
          <ChartLineSkeleton />
        </View>

        <View style={styles.progressSectionHeaderStacked}>
          <Block width={58} height={11} />
          <Block width={166} height={12} />
        </View>
        <RhythmSkeleton />

        <View style={styles.progressSectionHeaderStacked}>
          <Block width={62} height={11} />
          <Block width={194} height={12} />
        </View>
        <View style={styles.heatmapCard}>
          <View style={styles.heatmapRows}>
            {Array.from({ length: 7 }, (_, row) => (
              <View key={`heatmap-row-${row}`} style={styles.heatmapRow}>
                {Array.from({ length: 10 }, (_, cell) => (
                  <View key={`heatmap-cell-${row}-${cell}`} style={styles.heatmapCell} />
                ))}
              </View>
            ))}
          </View>
        </View>
      </View>
    </PageSkeleton>
  );
}

export function KairoSettingsSkeleton() {
  return (
    <SkeletonPulse>
      <View style={styles.settingsWrap}>
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
  taskRowSlim: {
    paddingVertical: spacing.sm,
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
  timelineHeaderGap: {
    height: spacing.xs,
  },
  timelineWrap: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  timelineSummary: {
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  timelineSectionGap: {
    height: spacing.md,
  },
  carouselWrap: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  carouselDateStrip: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: spacing.sm,
  },
  carouselCard: {
    padding: spacing.md,
    gap: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  carouselCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  inboxGroupHeader: {
    minHeight: 34,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginHorizontal: spacing.xs,
  },
  inboxGroupGap: {
    height: spacing.xs,
  },
  goalsWrap: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  goalsHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  goalCard: {
    minHeight: 86,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  goalTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  goalCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  goalProgress: {
    height: 2,
    width: "100%",
    borderRadius: radii.full,
    backgroundColor: colors.bgCardGlass,
  },
  progressWrap: {
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  progressSectionHeader: {
    marginHorizontal: spacing.lg,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressSectionHeaderStacked: {
    marginHorizontal: spacing.lg,
    gap: 4,
    paddingTop: spacing.md,
  },
  heroCard: {
    marginHorizontal: spacing.lg,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.lg,
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
    borderRadius: radii.lg,
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
    minHeight: 150,
    padding: spacing.lg,
    justifyContent: "center",
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  heatmapRows: {
    gap: spacing.xs,
  },
  heatmapRow: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  heatmapCell: {
    width: 16,
    height: 16,
    borderRadius: 4,
    backgroundColor: colors.bgCardGlass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  settingsWrap: {
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
