import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { NotificationPermissionState } from "../lib/notifications";

function formatStatusLabel(value: string): string {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusTone(status: string): "success" | "warning" | "error" | "muted" {
  if (status === "connected" || status === "granted") return "success";
  if (status === "error" || status === "denied") return "error";
  if (status === "undetermined") return "warning";
  return "muted";
}

function statusTextColor(status: string): string {
  const tone = getStatusTone(status);
  if (tone === "success") return "#6c9c7a";
  if (tone === "warning") return "#c77b3a";
  if (tone === "error") return "#c76a52";
  return "#6c6559";
}

type SettingsSheetProps = {
  visible: boolean;
  calendarSyncEnabled: boolean;
  gmailSyncEnabled: boolean;
  calendarSyncStatus: string;
  gmailSyncStatus: string;
  canToggleGmailSync: boolean;
  pendingGmailReviewCount: number;
  notificationPermissionState: NotificationPermissionState;
  notificationsEnabled: boolean;
  isDailyReminderEnabled: boolean;
  isCalendarSyncing: boolean;
  isGoogleToggleSaving: boolean;
  isGmailToggleSaving: boolean;
  isNotificationsBusy: boolean;
  syncSettingsBusy: boolean;
  onClose: () => void;
  onGoogleCalendarToggle: () => void;
  onGoogleCalendarSync: () => void;
  onEnableAndSyncGoogleCalendar: () => void;
  onGmailToggle: () => void;
  onRequestNotificationsAccess: () => void;
  onToggleDailyReminder: () => void;
  onSendTestNotification: () => void;
  onSignOut: () => void;
};

export function SettingsSheet({
  visible,
  calendarSyncEnabled,
  gmailSyncEnabled,
  calendarSyncStatus,
  gmailSyncStatus,
  canToggleGmailSync,
  pendingGmailReviewCount,
  notificationPermissionState,
  notificationsEnabled,
  isDailyReminderEnabled,
  isCalendarSyncing,
  isGoogleToggleSaving,
  isGmailToggleSaving,
  isNotificationsBusy,
  syncSettingsBusy,
  onClose,
  onGoogleCalendarToggle,
  onGoogleCalendarSync,
  onEnableAndSyncGoogleCalendar,
  onGmailToggle,
  onRequestNotificationsAccess,
  onToggleDailyReminder,
  onSendTestNotification,
  onSignOut,
}: SettingsSheetProps) {
  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.settingsBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.settingsSheet}>
          <View style={styles.settingsHandle} />

          <ScrollView
            style={styles.settingsScroll}
            contentContainerStyle={styles.settingsScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.settingsHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingsKicker}>Workspace</Text>
                <Text style={styles.settingsHeadline}>Settings</Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Close settings"
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.settingsCloseLink}>Close</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionHeader}>Sync</Text>

            <View style={styles.settingBlock}>
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingLabel}>Google Calendar</Text>
                  <Text style={styles.settingHelp}>Pull events and deadlines into Pravah.</Text>
                  <Text style={[styles.settingStatus, { color: statusTextColor(calendarSyncStatus) }]}>
                    {formatStatusLabel(calendarSyncStatus)}
                  </Text>
                </View>
                <Switch
                  value={calendarSyncEnabled}
                  onValueChange={onGoogleCalendarToggle}
                  disabled={isGoogleToggleSaving}
                  trackColor={{ false: colors.border, true: colors.accentSoft }}
                  thumbColor={calendarSyncEnabled ? colors.accent : colors.textMuted}
                />
              </View>
              <Pressable
                onPress={onGoogleCalendarSync}
                disabled={isCalendarSyncing}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Sync Google Calendar now"
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.inlineActionText, isCalendarSyncing && styles.inlineActionDisabled]}>
                  {isCalendarSyncing ? "Syncing…" : "Sync now"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.hairline} />

            <View style={styles.settingBlock}>
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingLabel}>Gmail</Text>
                  <Text style={styles.settingHelp}>Surface pending email follow-ups for review.</Text>
                  <Text style={[styles.settingStatus, { color: statusTextColor(gmailSyncStatus) }]}>
                    {formatStatusLabel(gmailSyncStatus)}
                  </Text>
                </View>
                <Switch
                  value={gmailSyncEnabled}
                  onValueChange={onGmailToggle}
                  disabled={isGmailToggleSaving || !canToggleGmailSync}
                  trackColor={{ false: colors.border, true: colors.accentSoft }}
                  thumbColor={gmailSyncEnabled ? colors.accent : colors.textMuted}
                />
              </View>
              <Text style={styles.settingMeta}>Pending review · {pendingGmailReviewCount}</Text>
              {!canToggleGmailSync ? (
                <Text style={styles.settingMeta}>Connect Gmail on web before enabling mobile sync.</Text>
              ) : null}
            </View>

            <Pressable
              onPress={onEnableAndSyncGoogleCalendar}
              disabled={syncSettingsBusy}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel="Enable and sync Google Calendar"
              style={({ pressed }) => [styles.sectionFootAction, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.inlineActionText, syncSettingsBusy && styles.inlineActionDisabled]}>
                Enable and sync Google Calendar
              </Text>
            </Pressable>

            <Text style={styles.sectionHeader}>Alerts</Text>

            <View style={styles.settingBlock}>
              <Text style={styles.settingLabel}>Notifications</Text>
              <Text style={styles.settingHelp}>Daily reminders and test alerts for mobile follow-through.</Text>
              <Text style={[styles.settingStatus, { color: statusTextColor(notificationPermissionState) }]}>
                {formatStatusLabel(notificationPermissionState)}
              </Text>

              {!notificationsEnabled ? (
                <Pressable
                  onPress={onRequestNotificationsAccess}
                  disabled={isNotificationsBusy}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel="Enable notifications"
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.inlineActionText, isNotificationsBusy && styles.inlineActionDisabled]}>
                    Enable notifications
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <View style={styles.hairline} />

            <View style={styles.settingBlock}>
              <View style={styles.settingRow}>
                <View style={styles.settingCopy}>
                  <Text style={styles.settingLabel}>Daily reminder</Text>
                  <Text style={styles.settingHelp}>Send one reminder at 9:00 AM every day.</Text>
                </View>
                <Switch
                  value={isDailyReminderEnabled}
                  onValueChange={onToggleDailyReminder}
                  disabled={isNotificationsBusy}
                  trackColor={{ false: colors.border, true: colors.accentSoft }}
                  thumbColor={isDailyReminderEnabled ? colors.accent : colors.textMuted}
                />
              </View>
              <Pressable
                onPress={onSendTestNotification}
                disabled={isNotificationsBusy}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Send a test notification"
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.inlineActionText, isNotificationsBusy && styles.inlineActionDisabled]}>
                  Send a test
                </Text>
              </Pressable>
            </View>

            <Text style={styles.sectionHeader}>Account</Text>

            <View style={styles.settingBlock}>
              <Text style={styles.settingHelp}>Sign out if you want to switch Google accounts on this device.</Text>
              <Pressable
                onPress={onSignOut}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel="Sign out"
                style={({ pressed }) => [pressed && { opacity: 0.6 }]}
              >
                <Text style={styles.signOutLink}>Sign out</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  settingsBackdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    justifyContent: "flex-end",
  },
  settingsSheet: {
    backgroundColor: colors.bgCard,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    paddingTop: spacing.sm,
    maxHeight: "90%",
    minHeight: "60%",
  },
  settingsHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  settingsScroll: {
    flexGrow: 0,
  },
  settingsScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  settingsKicker: {
    ...typography.micro,
    color: colors.textMuted,
  },
  settingsHeadline: {
    ...typography.headline,
    color: colors.textPrimary,
    marginTop: 2,
  },
  settingsCloseLink: {
    ...typography.micro,
    color: colors.accent,
    paddingTop: spacing.sm,
  },
  sectionHeader: {
    ...typography.micro,
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
  settingBlock: {
    gap: spacing.sm,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
  },
  settingCopy: {
    flex: 1,
    gap: 2,
  },
  settingLabel: {
    color: colors.textPrimary,
    ...typography.title,
  },
  settingHelp: {
    color: colors.textSecondary,
    ...typography.bodyMd,
  },
  settingStatus: {
    ...typography.micro,
    marginTop: spacing.xs,
  },
  settingMeta: {
    color: colors.textMuted,
    ...typography.micro,
  },
  hairline: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },
  inlineActionText: {
    color: colors.accent,
    ...typography.micro,
  },
  inlineActionDisabled: {
    color: colors.textMuted,
  },
  sectionFootAction: {
    marginTop: spacing.xs,
  },
  signOutLink: {
    color: colors.error,
    ...typography.micro,
  },
});
