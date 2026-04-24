import { useState } from "react";
import { Keyboard, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { colors, spacing, typography } from "../theme/tokens";
import {
  formatLocalDate,
  nextPriority,
  parseIsoDate,
  priorityDotColor,
  priorityLabel,
  type TaskPriority,
} from "../lib/task-form";

type TaskMetaFieldsProps = {
  deadline: string;
  priority: TaskPriority;
  onDeadlineChange: (value: string) => void;
  onPriorityChange: (priority: TaskPriority) => void;
  onClearError: () => void;
};

export function TaskMetaFields({
  deadline,
  priority,
  onDeadlineChange,
  onPriorityChange,
  onClearError,
}: TaskMetaFieldsProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);

  return (
    <>
      <View style={styles.metaRow}>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            setShowDatePicker(true);
          }}
          style={({ pressed }) => [styles.metaField, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.metaLabel}>Due</Text>
          <Text style={deadline ? styles.metaValue : styles.metaPlaceholder}>{deadline || "—"}</Text>
        </Pressable>

        {deadline ? (
          <Pressable
            onPress={() => {
              onDeadlineChange("");
              onClearError();
            }}
            style={({ pressed }) => [styles.clearAction, pressed && { opacity: 0.6 }]}
            hitSlop={8}
          >
            <Text style={styles.clearActionText}>Clear</Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => {
            onPriorityChange(nextPriority(priority));
            void Haptics.selectionAsync();
          }}
          style={({ pressed }) => [styles.metaField, pressed && { opacity: 0.6 }]}
          hitSlop={6}
        >
          <Text style={styles.metaLabel}>Priority</Text>
          <View style={styles.priorityValue}>
            <View style={[styles.priorityDot, { backgroundColor: priorityDotColor(priority) }]} />
            <Text style={priority ? styles.metaValue : styles.metaPlaceholder}>{priorityLabel(priority)}</Text>
          </View>
        </Pressable>
      </View>

      {showDatePicker ? (
        <DateTimePicker
          value={parseIsoDate(deadline)}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(_event, selectedDate) => {
            if (Platform.OS === "android") {
              setShowDatePicker(false);
            }
            if (selectedDate) {
              onDeadlineChange(formatLocalDate(selectedDate));
              onClearError();
            }
          }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  metaRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xl,
  },
  metaField: {
    gap: 4,
  },
  metaLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  metaValue: {
    ...typography.numeric,
    color: colors.textPrimary,
  },
  metaPlaceholder: {
    ...typography.numeric,
    color: colors.textMuted,
  },
  priorityValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  priorityDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  clearAction: {
    paddingBottom: 2,
  },
  clearActionText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
});
