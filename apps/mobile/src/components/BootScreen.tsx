import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet, Text } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { colors, spacing, typography } from "../theme/tokens";
import { BrandMark } from "./BrandMark";
import { GridBackground } from "./GridBackground";

type BootScreenProps = {
  title?: string;
  detail?: string;
};

export function BootScreen({
  title = "Loading your workspace...",
  detail,
}: BootScreenProps) {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <GridBackground />
      <Animated.View entering={FadeIn.duration(400)} style={styles.content}>
        <BrandMark size={34} />
        <Text style={styles.title}>{title}</Text>
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
    justifyContent: "center",
  },
  content: {
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    ...typography.title,
    textAlign: "center",
  },
  detail: {
    color: colors.textSecondary,
    ...typography.bodyMd,
    textAlign: "center",
    maxWidth: 320,
  },
});
