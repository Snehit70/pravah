import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { isWidgetSupported, requestPinHomeWidget, type PinWidgetResult } from "../widget/widgetBridge";
import { WIDGET_NAMES, type WidgetName } from "../widget/widgetNames";

const CHOICES: { name: WidgetName; label: string }[] = [
  { name: WIDGET_NAMES.today, label: "Today" },
  { name: WIDGET_NAMES.agenda, label: "Agenda" },
  { name: WIDGET_NAMES.focus, label: "Focus" },
  { name: WIDGET_NAMES.capture, label: "Capture" },
  { name: WIDGET_NAMES.captureIcon, label: "Capture icon" },
];

function resultCopy(result: PinWidgetResult): string {
  switch (result) {
    case "requested":
      return "Confirm on the prompt to place it. If nothing appears, allow Pravah to add home screen shortcuts in app settings.";
    case "unsupported":
      return "Your launcher can't add widgets from apps. Add it from the launcher's widget list instead.";
    case "failed":
      return "Couldn't reach the launcher. Try again.";
  }
}

/**
 * Lets the user place a widget without the launcher's picker, which MIUI
 * filters Pravah out of. Renders nothing where widgets don't exist.
 */
export function HomeWidgetSection() {
  const [result, setResult] = useState<PinWidgetResult | null>(null);
  const [pending, setPending] = useState<WidgetName | null>(null);

  if (!isWidgetSupported()) return null;

  return (
    <View style={styles.group}>
      <View style={styles.divider} />
      <Text style={styles.label}>Home screen widgets</Text>
      <Text style={styles.help}>Pick one to add it to your home screen.</Text>
      <View style={styles.actions}>
        {CHOICES.map((choice) => (
          <Pressable
            key={choice.name}
            onPress={async () => {
              setPending(choice.name);
              try {
                setResult(await requestPinHomeWidget(choice.name));
              } finally {
                setPending(null);
              }
            }}
            disabled={pending !== null}
            accessibilityRole="button"
            accessibilityLabel={`Add ${choice.label} widget to home screen`}
            accessibilityState={{ disabled: pending !== null }}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.6 }, pending !== null && styles.disabled]}
          >
            <Text style={styles.buttonText}>{choice.label}</Text>
          </Pressable>
        ))}
      </View>
      {result ? (
        <Text accessibilityLiveRegion="polite" style={styles.help}>
          {resultCopy(result)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = createThemedStyles({
  group: {
    gap: spacing.sm,
  },
  divider: {
    height: 1,
    backgroundColor: colors.bgInput,
    marginHorizontal: -spacing.lg,
    marginVertical: spacing.xs,
  },
  label: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  help: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  button: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: colors.bgSurface,
    borderColor: colors.borderSubtle,
  },
  buttonText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  disabled: {
    opacity: 0.5,
  },
});
