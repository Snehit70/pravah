import { StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../theme/tokens";

export type TaskImageBudgetStatus = {
  status: "normal" | "warning" | "blocked" | "unavailable";
  warning: boolean;
  grantsBlocked: boolean;
  usage: null | { pooledPercentage: number };
};

export function TaskImageBudgetNotice({
  status,
}: {
  status?: TaskImageBudgetStatus;
}) {
  if (!status || status.status === "normal") return null;

  const percentage = status.usage
    ? Math.round(status.usage.pooledPercentage * 10) / 10
    : null;
  const message =
    status.status === "warning" && percentage !== null
      ? `Task image usage is at ${percentage}%. New uploads pause at 85%.`
      : status.status === "blocked" && percentage !== null
        ? `New Task image uploads are paused at ${percentage}% usage. Existing images remain available.`
        : "New Task image uploads are paused while usage is unavailable. Existing images remain available.";

  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={styles.notice}
    >
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.warning,
    borderRadius: radii.md,
    backgroundColor: colors.warningMuted,
  },
  text: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
});
