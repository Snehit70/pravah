import { useEffect } from "react";
import { StyleSheet, View, type DimensionValue } from "react-native";
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

function SkeletonPulse({ children }: { children: React.ReactNode }) {
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

export function TaskListSkeleton({ variant }: { variant: "inbox" | "timeline" | "completed" }) {
  const rows = variant === "timeline" ? 5 : 4;

  return (
    <SkeletonPulse>
      <View style={styles.listWrap}>
        {variant === "timeline" ? (
          <>
            <Block width={84} height={10} />
            <View style={styles.timelineHeaderGap} />
          </>
        ) : null}

        {Array.from({ length: rows }, (_, index) => (
          <View key={`${variant}-${index}`} style={styles.taskRow}>
            <View style={styles.priorityRail} />
            <View style={styles.taskCopy}>
              <Block width={index % 2 === 0 ? "74%" : "61%"} height={14} />
              <Block width={index % 3 === 0 ? "48%" : "36%"} height={10} />
            </View>
          </View>
        ))}

        {variant === "timeline" ? (
          <>
            <View style={styles.timelineSectionGap} />
            <Block width={112} height={10} />
            <View style={styles.timelineHeaderGap} />
            <View style={styles.taskRow}>
              <View style={styles.priorityRail} />
              <View style={styles.taskCopy}>
                <Block width="68%" height={14} />
                <Block width="42%" height={10} />
              </View>
            </View>
          </>
        ) : null}
      </View>
    </SkeletonPulse>
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
  timelineSectionGap: {
    height: spacing.md,
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
