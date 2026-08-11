import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { weekdayDate } from "../lib/dates";
import { ThemedDatePicker } from "./ThemedDatePicker";
import { CalendarIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ChevronUpIcon, ClockIcon, TrashIcon } from "./UiIcons";
import type { ManualTriageTarget, OverduePreviewGroup, OverduePreviewOrphan, PendingManualTriageChange } from "../features/overdue-triage/types";

type Props = {
  visible: boolean;
  totalOverdue: number;
  groups: OverduePreviewGroup[];
  orphans: OverduePreviewOrphan[];
  selectedPreview: OverduePreviewGroup | null;
  applyDeadline: boolean;
  today: string;
  onClose: () => void;
  onOpenPreview: (goalId: string) => void;
  onClosePreview: () => void;
  onSetApplyDeadline: (value: boolean) => void;
  onConfirmPreview: () => void;
  onApplySuggestedDates: (goalId: string) => void;
  onRescheduleAllGoals?: () => void;
  onApplyChanges: (changes: PendingManualTriageChange[]) => void;
};

export function OverdueTriageSheet(props: Props) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  return (
    <Modal visible={props.visible} transparent animationType={reducedMotion ? "none" : "slide"} statusBarTranslucent onRequestClose={props.onClose}>
      <View style={[styles.overlay, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.backdropDim]} />
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Dismiss overdue review" onPress={props.onClose} />
        <View style={styles.card}>
          <View style={styles.grab} />
          {props.selectedPreview ? <PreviewView {...props} preview={props.selectedPreview} onBack={props.onClosePreview} onConfirm={props.onConfirmPreview} /> : <OverviewView key={props.visible ? "open" : "closed"} {...props} />}
        </View>
      </View>
    </Modal>
  );
}

function Header({ title, onBack }: { title: string; onBack?: () => void }) {
  return <View style={styles.header}>
    {onBack ? <Pressable style={styles.headerIcon} onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to overdue review"><ChevronLeftIcon color={colors.textSecondary} size={21} /></Pressable> : <View style={styles.headerIcon} />}
    <Text style={styles.kicker}>{title}</Text>
    <View style={styles.headerIcon} />
  </View>;
}

function OverviewView({ totalOverdue, groups, orphans, today, onOpenPreview, onApplySuggestedDates, onRescheduleAllGoals, onApplyChanges }: Props) {
  const [pending, setPending] = useState<Map<string, PendingManualTriageChange>>(new Map());
  const [expandedId, setExpandedId] = useState<string | null>(orphans[0]?.taskId ?? null);
  const [pickerId, setPickerId] = useState<string | null>(null);
  const choose = (orphan: OverduePreviewOrphan, target: ManualTriageTarget) => setPending((current) => {
    const next = new Map(current);
    next.set(orphan.taskId, { taskId: orphan.taskId, title: orphan.title, target });
    return next;
  });
  const clear = (taskId: string) => setPending((current) => {
    const next = new Map(current);
    next.delete(taskId);
    return next;
  });
  return <>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent} accessibilityLabel="Overdue tasks">
      <Text style={styles.title}>{totalOverdue} overdue tasks</Text>

      {groups.length > 0 ? <View style={styles.section}>
        <SectionLabel label="Plans" />
        {groups.map((group) => <GoalCard key={group.goalId} group={group} onOpenPreview={onOpenPreview} onApply={onApplySuggestedDates} />)}
        {onRescheduleAllGoals && groups.length > 1 ? <Pressable style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]} onPress={onRescheduleAllGoals} accessibilityRole="button" accessibilityLabel="Apply all plan suggestions"><CalendarIcon color={colors.accent} size={17} /><Text style={styles.secondaryButtonText}>Apply all plan suggestions</Text></Pressable> : null}
      </View> : null}

      {orphans.length > 0 ? <View style={styles.section}>
        <View style={styles.individualList}>
          {orphans.map((orphan) => <TaskRow key={orphan.taskId} orphan={orphan} change={pending.get(orphan.taskId)} expanded={expandedId === orphan.taskId} onToggle={() => setExpandedId(expandedId === orphan.taskId ? null : orphan.taskId)} onChoose={(target) => choose(orphan, target)} onPick={() => setPickerId(orphan.taskId)} onClear={() => clear(orphan.taskId)} />)}
        </View>
      </View> : null}
      {groups.length === 0 && orphans.length === 0 ? <View style={styles.empty}><CheckIcon color={colors.success} size={25} /><Text style={styles.emptyTitle}>Nothing needs review</Text><Text style={styles.emptyCopy}>Your timeline is up to date.</Text></View> : null}
    </ScrollView>
    <View style={styles.footer}>
      <Pressable disabled={pending.size === 0} onPress={() => onApplyChanges([...pending.values()])} accessibilityRole="button" accessibilityState={{ disabled: pending.size === 0 }} accessibilityLabel={pending.size ? `Apply ${pending.size} changes` : "Apply changes"} style={({ pressed }) => [styles.primaryButton, pending.size === 0 && styles.primaryDisabled, pressed && pending.size > 0 && styles.pressed]}>
        <CheckIcon color={pending.size ? colors.textInverse : colors.textMuted} size={18} />
        <Text style={[styles.primaryText, pending.size === 0 && styles.primaryTextDisabled]}>{pending.size ? `Apply ${pending.size} change${pending.size === 1 ? "" : "s"}` : "Apply changes"}</Text>
      </Pressable>
      <Text style={styles.undoNote}>Changes can be undone.</Text>
    </View>
    {pickerId ? <ThemedDatePicker visible value={selectedDate(pending.get(pickerId)?.target)} minDate={today} onSelect={(date) => { const orphan = orphans.find((entry) => entry.taskId === pickerId); if (orphan) choose(orphan, { date }); setPickerId(null); }} onClose={() => setPickerId(null)} /> : null}
  </>;
}

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

function GoalCard({ group, onOpenPreview, onApply }: { group: OverduePreviewGroup; onOpenPreview: (goalId: string) => void; onApply: (goalId: string) => void }) {
  return <View style={styles.goalCard}>
    <View style={styles.goalHeader}><View style={styles.goalIcon}><CalendarIcon color={colors.accent} size={19} /></View><View style={styles.copy}><Text style={styles.goalTitle} numberOfLines={1}>{group.goalText}</Text><Text style={styles.meta}>{group.overdueCount} overdue · {group.movedCount} tasks in plan</Text></View></View>
    {group.suggestedDeadline ? <View style={styles.suggestion}><Text style={styles.suggestionLabel}>Suggested destination</Text><Text style={styles.suggestionDate}>{weekdayDate(group.suggestedDeadline)}</Text></View> : null}
    <View style={styles.goalActions}>
      <Pressable style={({ pressed }) => [styles.outlineButton, pressed && styles.pressed]} onPress={() => onOpenPreview(group.goalId)} accessibilityRole="button" accessibilityLabel={`Review plan for ${group.goalText}`}><Text style={styles.outlineText}>Review plan</Text><ChevronRightIcon color={colors.accent} size={16} /></Pressable>
      <Pressable style={({ pressed }) => [styles.smallPrimary, pressed && styles.pressed]} onPress={() => onApply(group.goalId)} accessibilityRole="button" accessibilityLabel={`Apply suggested dates for ${group.goalText}`}><Text style={styles.smallPrimaryText}>Apply suggestions</Text></Pressable>
    </View>
  </View>;
}

function TaskRow({ orphan, change, expanded, onToggle, onChoose, onPick, onClear }: { orphan: OverduePreviewOrphan; change?: PendingManualTriageChange; expanded: boolean; onToggle: () => void; onChoose: (target: ManualTriageTarget) => void; onPick: () => void; onClear: () => void }) {
  return <View style={[styles.taskCard, expanded && styles.taskExpanded, change && styles.taskSelected]}>
    <Pressable style={({ pressed }) => [styles.taskHeader, pressed && styles.pressed]} onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded }} accessibilityLabel={orphan.title}>
      <View style={[styles.taskStatus, change && styles.taskStatusSelected]}>{change ? <CheckIcon color={colors.textInverse} size={14} /> : null}</View><View style={styles.copy}><Text style={styles.taskTitle} numberOfLines={1}>{orphan.title}</Text></View>{expanded ? <ChevronUpIcon color={colors.accent} size={18} /> : <ChevronRightIcon color={colors.textMuted} size={18} />}
    </Pressable>
    {expanded ? <View style={styles.actions}><View style={styles.actionGrid}>
      <Action label="Today" icon={<ClockIcon color={colors.accent} size={15} />} selected={change?.target === "today"} onPress={() => onChoose("today")} />
      <Action label="Tomorrow" icon={<CalendarIcon color={colors.accent} size={15} />} selected={change?.target === "tomorrow"} onPress={() => onChoose("tomorrow")} />
      <Action label="Pick date" icon={<CalendarIcon color={colors.accent} size={15} />} selected={typeof change?.target === "object"} onPress={onPick} />
      <Action label="Drop" icon={<TrashIcon color={colors.deadline} size={15} />} selected={change?.target === "drop"} destructive onPress={() => onChoose("drop")} />
    </View>{change ? <Pressable style={styles.clear} onPress={onClear} accessibilityRole="button" accessibilityLabel={`Clear decision for ${orphan.title}`}><Text style={styles.clearText}>Clear decision</Text></Pressable> : null}</View> : null}
  </View>;
}

function Action({ label, icon, selected, destructive, onPress }: { label: string; icon: ReactNode; selected: boolean; destructive?: boolean; onPress: () => void }) {
  return <Pressable style={({ pressed }) => [styles.action, selected && (destructive ? styles.destructiveSelected : styles.actionSelected), pressed && styles.pressed]} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={label}>{icon}<Text style={[styles.actionText, selected && { color: destructive ? colors.deadline : colors.accent }]}>{label}</Text></Pressable>;
}

function selectedDate(target?: ManualTriageTarget) {
  return target && typeof target === "object" ? target.date : undefined;
}

function PreviewView({ preview, applyDeadline, onBack, onSetApplyDeadline, onConfirm }: Props & { preview: OverduePreviewGroup; onBack: () => void; onConfirm: () => void }) {
  const tasksByDate = new Map<string, OverduePreviewGroup["tasks"]>();
  for (const task of preview.tasks) tasksByDate.set(task.nextDate, [...(tasksByDate.get(task.nextDate) ?? []), task]);
  return <>
    <Header title="Plan preview" onBack={onBack} />
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
      <Text style={styles.title} numberOfLines={2}>{preview.goalText}</Text><Text style={styles.help}>{preview.overdueCount} overdue · {preview.movedCount} tasks will receive new dates</Text>
      <View style={styles.previewList}>{[...tasksByDate.entries()].map(([date, tasks]) => <View key={date} style={styles.dateGroup}><View style={styles.dateHeader}><CalendarIcon color={colors.accent} size={16} /><Text style={styles.dateText}>{weekdayDate(date)}</Text><Text style={styles.dateCount}>{tasks.length} {tasks.length === 1 ? "task" : "tasks"}</Text></View>{tasks.slice(0, 8).map((task) => <View key={task.taskId} style={styles.previewTask}><CheckIcon color={colors.success} size={15} /><Text style={styles.previewTaskText} numberOfLines={1}>{task.title}</Text></View>)}</View>)}</View>
      {preview.suggestedDeadline ? <Pressable style={styles.toggle} onPress={() => onSetApplyDeadline(!applyDeadline)} accessibilityRole="checkbox" accessibilityState={{ checked: applyDeadline }} accessibilityLabel="Move goal deadline too"><View style={[styles.checkbox, applyDeadline && styles.checkboxOn]}>{applyDeadline ? <CheckIcon color={colors.textInverse} size={14} /> : null}</View><View style={styles.copy}><Text style={styles.goalTitle}>Move goal deadline too</Text><Text style={styles.meta}>{weekdayDate(preview.suggestedDeadline)}</Text></View></Pressable> : null}
    </ScrollView>
    <View style={styles.footer}><Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]} onPress={onConfirm} accessibilityRole="button" accessibilityLabel="Apply overdue plan"><CheckIcon color={colors.textInverse} size={18} /><Text style={styles.primaryText}>Apply plan</Text></Pressable><Text style={styles.undoNote}>This reflow can be undone.</Text></View>
  </>;
}

const styles = createThemedStyles({
  overlay: { flex: 1, justifyContent: "flex-end" }, backdropDim: { backgroundColor: colors.backdrop },
  card: { height: "88%", maxHeight: "88%", backgroundColor: colors.bgFloating, borderTopLeftRadius: radii.xl, borderTopRightRadius: radii.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, overflow: "hidden" },
  grab: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: spacing.xs, marginBottom: spacing.sm },
  header: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerIcon: { width: 44, height: 44, alignItems: "center", justifyContent: "center" }, kicker: { ...typography.micro, color: colors.textMuted },
  scrollContent: { flexGrow: 1, paddingTop: spacing.lg, paddingBottom: spacing.md, gap: spacing.md }, title: { ...typography.display, color: colors.textPrimary }, help: { ...typography.bodyMd, color: colors.textSecondary, lineHeight: 22 },
  summaryRow: { flexDirection: "row", gap: spacing.sm }, chip: { minHeight: 36, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radii.full }, deadlineChip: { backgroundColor: colors.deadlineMuted }, warningChip: { backgroundColor: colors.warningMuted }, chipText: { ...typography.bodyMd },
  section: { gap: spacing.sm }, sectionLabelRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: spacing.xs }, sectionLabel: { ...typography.title, color: colors.textPrimary }, sectionDetail: { ...typography.bodyMd, color: colors.textMuted }, sectionHelp: { ...typography.bodyMd, color: colors.textSecondary, marginTop: -spacing.xs },
  goalCard: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle, padding: spacing.md, gap: spacing.sm }, goalHeader: { flexDirection: "row", alignItems: "center", gap: spacing.sm }, goalIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.accentDim, alignItems: "center", justifyContent: "center" }, copy: { flex: 1, minWidth: 0, gap: 2 }, goalTitle: { ...typography.title, color: colors.textPrimary }, meta: { ...typography.bodyMd, color: colors.textMuted }, suggestion: { flexDirection: "row", justifyContent: "space-between", paddingTop: spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle }, suggestionLabel: { ...typography.bodyMd, color: colors.textSecondary }, suggestionDate: { ...typography.bodyMd, color: colors.accent }, goalActions: { flexDirection: "row", gap: spacing.sm }, outlineButton: { flex: 1, minHeight: 42, borderRadius: 12, borderWidth: 1, borderColor: colors.accentSoft, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs }, outlineText: { ...typography.bodyMd, color: colors.accent }, smallPrimary: { flex: 1, minHeight: 42, borderRadius: 12, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm }, smallPrimaryText: { ...typography.bodyMd, color: colors.textInverse }, secondaryButton: { minHeight: 46, borderRadius: 12, backgroundColor: colors.accentDim, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }, secondaryButtonText: { ...typography.bodyMd, color: colors.accent },
  individualList: { gap: spacing.sm }, taskCard: { backgroundColor: colors.bgCard, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle, overflow: "hidden" }, taskExpanded: { borderColor: colors.accentSoft }, taskSelected: { backgroundColor: colors.accentDim }, taskHeader: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.md }, taskStatus: { width: 27, height: 27, borderRadius: 9, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bgSurface, alignItems: "center", justifyContent: "center" }, taskStatusSelected: { backgroundColor: colors.accent, borderColor: colors.accent }, taskTitle: { ...typography.title, color: colors.textPrimary }, taskMeta: { ...typography.bodyMd, color: colors.textMuted }, taskMetaSelected: { color: colors.accent }, actions: { paddingHorizontal: spacing.md, paddingBottom: spacing.md, paddingTop: spacing.xs }, actionGrid: { flexDirection: "row", flexWrap: "nowrap", gap: spacing.xs }, action: { flex: 1, minWidth: 0, minHeight: 64, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: 2, borderRadius: 12, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }, actionSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft }, destructiveSelected: { borderColor: colors.deadline, backgroundColor: colors.deadlineMuted }, actionText: { ...typography.bodyMd, color: colors.textSecondary, fontSize: 12, lineHeight: 16, flexShrink: 1 }, clear: { alignSelf: "flex-start", minHeight: 32, justifyContent: "center" }, clearText: { ...typography.bodyMd, color: colors.textMuted, textDecorationLine: "underline" },
  footer: { paddingTop: spacing.sm, paddingBottom: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle, backgroundColor: colors.bgFloating }, primaryButton: { minHeight: 50, borderRadius: 12, backgroundColor: colors.accent, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm }, primaryDisabled: { backgroundColor: colors.bgInput }, primaryText: { ...typography.title, color: colors.textInverse }, primaryTextDisabled: { color: colors.textMuted }, undoNote: { ...typography.bodyMd, color: colors.textMuted, textAlign: "center", marginTop: spacing.xs }, pressed: { opacity: 0.7 }, empty: { flex: 1, minHeight: 180, alignItems: "center", justifyContent: "center", gap: spacing.xs }, emptyTitle: { ...typography.title, color: colors.textPrimary }, emptyCopy: { ...typography.bodyMd, color: colors.textMuted },
  previewList: { paddingVertical: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle, gap: spacing.md }, dateGroup: { gap: spacing.xs }, dateHeader: { flexDirection: "row", alignItems: "center", gap: spacing.xs }, dateText: { ...typography.bodyMd, color: colors.accent }, dateCount: { ...typography.bodyMd, color: colors.textMuted, marginLeft: "auto" }, previewTask: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 36, paddingLeft: spacing.sm }, previewTaskText: { ...typography.bodyMd, color: colors.textPrimary, flex: 1 }, toggle: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.sm }, checkbox: { width: 27, height: 27, borderRadius: 8, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.bgSurface, alignItems: "center", justifyContent: "center" }, checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
