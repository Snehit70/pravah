/**
 * GoalSettingsSheet
 *
 * The goal's identity — title, notes, priority, deadline — plus deleting it.
 *
 * These used to live inside the detail sheet: an "Edit" button swapped the whole
 * scroll area for a form, which needed a permanent uppercase hint to explain
 * itself, and delete sat under the task list as a full-width red button. Both
 * are rare administrative acts on a surface whose job is working the goal, so
 * they moved out here — the same way a task opens its own editor.
 */

import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useConfirm } from "../hooks/useConfirm";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { humanDate } from "../lib/dates";
import { haptic } from "../lib/haptic";
import type { GoalItem } from "../lib/goalsStorage";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { ThemedDatePicker } from "./ThemedDatePicker";
import { CalendarIcon, ChevronDownIcon, CloseIcon, TrashIcon } from "./UiIcons";

export type GoalDraftFields = {
  text: string;
  description: string;
  deadline: string;
  priority: GoalItem["priority"];
};

type GoalSettingsSheetProps = {
  /**
   * Drives the Modal. Separate from `goal` so the parent can close the sheet
   * without nulling the content — the slide-out keeps its page.
   */
  visible: boolean;
  /** The goal being edited; kept during the exit animation. */
  goal: GoalItem | null;
  /** Number of tasks linked, so delete can say what it will unlink. */
  linkedCount: number;
  onClose: () => void;
  onSave: (fields: GoalDraftFields) => void;
  onDelete: () => void;
};

const PRIORITIES: readonly NonNullable<GoalItem["priority"]>[] = ["p1", "p2", "p3"];

const PRIORITY_LABEL: Record<NonNullable<GoalItem["priority"]>, string> = {
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

export function GoalSettingsSheet({
  visible,
  goal,
  linkedCount,
  onClose,
  onSave,
  onDelete,
}: GoalSettingsSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const confirm = useConfirm();
  const [text, setText] = useState(() => goal?.text ?? "");
  const [description, setDescription] = useState(() => goal?.description ?? "");
  const [deadline, setDeadline] = useState(() => goal?.deadline ?? "");
  const [priority, setPriority] = useState<GoalItem["priority"]>(() => goal?.priority);
  const [pickingDate, setPickingDate] = useState(false);
  // Notes grow with their content: start one line tall, follow the text up to
  // a cap, then scroll internally. Measured, not guessed — Android multiline
  // inputs don't reliably auto-grow.
  const [notesHeight, setNotesHeight] = useState(0);

  // Re-seed the draft on every open (adjust-during-render, per React docs).
  // The sheet stays mounted across open/close so its exit animation keeps its
  // content, which means a remount key can no longer discard stale drafts.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible && goal) {
      setText(goal.text);
      setDescription(goal.description ?? "");
      setDeadline(goal.deadline ?? "");
      setPriority(goal.priority);
      setPickingDate(false);
      setNotesHeight(0);
    }
  }

  const handleSave = () => {
    if (!text.trim()) return;
    onSave({ text, description, deadline, priority });
    haptic.success();
    onClose();
  };

  const handleDelete = async () => {
    if (!goal) return;
    const ok = await confirm({
      title: "Delete goal?",
      message:
        linkedCount > 0
          ? `${goal.text}\n\n${linkedCount} linked ${linkedCount === 1 ? "task" : "tasks"} will be unlinked but kept.`
          : goal.text,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    onDelete();
  };

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType={reducedMotion ? "none" : "slide"}
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        {goal ? (
          // The Modal's slide is the entrance; no second animation on top.
          <View style={styles.card}>
            <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.lg) }]}>
              <Text style={styles.heading}>Goal settings</Text>
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Close goal settings"
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              >
                <CloseIcon size={17} color={colors.textSecondary} strokeWidth={1.9} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.scrollArea}
              contentContainerStyle={[
                styles.scrollContent,
                { paddingBottom: Math.max(insets.bottom, spacing.lg) },
              ]}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Title</Text>
                <TextInput
                  value={text}
                  onChangeText={setText}
                  style={styles.input}
                  placeholder="Goal title"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Goal title"
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Notes</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  onContentSizeChange={(e) => setNotesHeight(e.nativeEvent.contentSize.height)}
                  style={[
                    styles.input,
                    styles.textArea,
                    { height: Math.min(Math.max(42, notesHeight + 18), 180) },
                  ]}
                  placeholder="Optional notes"
                  placeholderTextColor={colors.textMuted}
                  accessibilityLabel="Goal notes"
                  multiline
                  scrollEnabled={notesHeight + 18 > 180}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Priority</Text>
                <View style={styles.priorityPicker}>
                  {PRIORITIES.map((p) => {
                    const active = priority === p;
                    return (
                      <Pressable
                        key={p}
                        onPress={() => setPriority(active ? undefined : p)}
                        accessibilityRole="button"
                        accessibilityLabel={`Priority ${PRIORITY_LABEL[p]}`}
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [
                          styles.priorityOption,
                          active && styles.priorityOptionActive,
                          pressed && { opacity: 0.75 },
                        ]}
                      >
                        <Text
                          style={[styles.priorityOptionText, active && styles.priorityOptionTextActive]}
                        >
                          {PRIORITY_LABEL[p]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Deadline</Text>
                {/* One control, styled as a button (bgCard, not the input
                    tint): tap anywhere opens the calendar. Empty state trails
                    a chevron — this chooses, you don't type here. Set state
                    trails an inline ✕ that clears. */}
                <Pressable
                  onPress={() => setPickingDate(true)}
                  accessibilityRole="button"
                  accessibilityLabel={
                    deadline ? `Change deadline, currently ${humanDate(deadline)}` : "Pick a deadline"
                  }
                  style={({ pressed }) => [styles.deadlineBtn, pressed && { opacity: 0.75 }]}
                >
                  <CalendarIcon size={15} color={colors.textSecondary} strokeWidth={1.8} />
                  <Text style={[styles.deadlineText, !deadline && styles.deadlineTextEmpty]}>
                    {deadline ? humanDate(deadline) : "Pick a date…"}
                  </Text>
                  <View style={styles.deadlineSpacer} />
                  {deadline ? (
                    <Pressable
                      onPress={(event) => {
                        event.stopPropagation();
                        setDeadline("");
                      }}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel="Clear deadline"
                      style={({ pressed }) => [styles.deadlineClear, pressed && { opacity: 0.6 }]}
                    >
                      <CloseIcon size={13} color={colors.textMuted} strokeWidth={2} />
                    </Pressable>
                  ) : (
                    <ChevronDownIcon size={14} color={colors.textMuted} strokeWidth={2} />
                  )}
                </Pressable>
              </View>

              {/* Same action grammar as the task editor: destructive chip on
                  the left, intrinsic-width primary pill on the right. */}
              <View style={styles.actions}>
                <Pressable
                  onPress={() => void handleDelete()}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Delete goal ${goal.text}`}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
                >
                  <TrashIcon size={13} color={colors.error} strokeWidth={1.8} />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </Pressable>
                <Pressable
                  onPress={handleSave}
                  disabled={!text.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Save goal changes"
                  style={({ pressed }) => [
                    styles.saveBtn,
                    !text.trim() && styles.saveBtnDisabled,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text style={[styles.saveBtnText, !text.trim() && styles.saveBtnTextDisabled]}>
                    Save
                  </Text>
                </Pressable>
              </View>
            </ScrollView>

            <ThemedDatePicker
              visible={pickingDate}
              value={deadline || undefined}
              onSelect={(iso) => {
                setDeadline(iso);
                setPickingDate(false);
              }}
              onClose={() => setPickingDate(false)}
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  card: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  heading: {
    ...typography.headline,
    flex: 1,
    color: colors.textPrimary,
  },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: radii.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  fieldLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  input: {
    ...typography.bodyMd,
    minHeight: 42,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    backgroundColor: colors.bgInput,
    borderRadius: radii.md,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    color: colors.textPrimary,
  },
  textArea: {
    textAlignVertical: "top",
  },
  priorityPicker: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  // Same scale as the inbox filter pills the user signed off on: 28 tall,
  // 11×4 padding, radius sm.
  priorityOption: {
    minWidth: 44,
    height: 28,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
    alignItems: "center",
    justifyContent: "center",
  },
  priorityOptionActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentDim,
  },
  priorityOptionText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  priorityOptionTextActive: {
    color: colors.accent,
  },
  deadlineBtn: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bgCard,
    borderRadius: radii.md,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  deadlineText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  deadlineTextEmpty: {
    color: colors.textMuted,
  },
  deadlineSpacer: {
    flex: 1,
  },
  deadlineClear: {
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    borderCurve: "continuous",
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  // Mirrors EditTaskSheet's action row: delete as a compact bordered chip,
  // save as an intrinsic-width accent pill — never a full-width slab.
  actions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: spacing.sm,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    borderCurve: "continuous",
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnDisabled: {
    backgroundColor: colors.border,
  },
  saveBtnText: {
    ...typography.title,
    color: colors.bg,
  },
  saveBtnTextDisabled: {
    color: colors.textMuted,
  },
  deleteBtn: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.errorMuted,
  },
  deleteBtnText: {
    ...typography.micro,
    fontWeight: "700",
    color: colors.error,
  },
});
