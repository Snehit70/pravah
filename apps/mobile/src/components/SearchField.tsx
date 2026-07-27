import { StyleSheet, TextInput, View } from "react-native";
import type { TextInputProps } from "react-native";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { SearchIcon } from "./UiIcons";

type SearchFieldProps = Omit<TextInputProps, "style"> & {
  compact?: boolean;
};

/** A single search-control vocabulary for task, history, and goal filtering. */
export function SearchField({ compact = false, ...inputProps }: SearchFieldProps) {
  return (
    <View style={[styles.field, compact && styles.fieldCompact]}>
      <SearchIcon color={colors.textMuted} size={compact ? 16 : 18} />
      <TextInput
        {...inputProps}
        style={[styles.input, compact && styles.inputCompact]}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
    </View>
  );
}

const styles = createThemedStyles({
  field: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgInput,
  },
  fieldCompact: {
    minHeight: 38,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
  },
  input: {
    flex: 1,
    minHeight: 46,
    ...typography.bodyMd,
    color: colors.textPrimary,
    paddingVertical: 0,
  },
  inputCompact: {
    minHeight: undefined,
    fontSize: 14,
    paddingVertical: spacing.xs,
  },
});
