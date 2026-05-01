import { useCallback, useEffect, useRef } from "react";
import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { NotificationPermissionState } from "../lib/notifications";
import { KairoSettingsSection } from "./KairoSettingsSection";

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
  if (tone === "success") return colors.primary;
  if (tone === "warning") return colors.accent;
  if (tone === "error") return colors.error;
  return colors.textMuted;
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
  const bottomSheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.expand();
    } else {
      bottomSheetRef.current?.close();
    }
  }, [visible]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        pressBehavior="close"
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.6}
      />
    ),
    []
  );

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={["92%"]}
      enablePanDownToClose
      enableDynamicSizing={false}
      backgroundStyle={styles.settingsSheet}
      handleIndicatorStyle={styles.settingsHandle}
      backdropComponent={renderBackdrop}
      keyboardBehavior="extend"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onChange={(index) => {
        if (index === -1 && visible) {
          onClose();
        }
      }}
    >
      <BottomSheetScrollView
        contentContainerStyle={[styles.settingsScrollContent, { paddingBottom: insets.bottom + spacing.section }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
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

            <View style={styles.sectionJumpRow}>
              {(["Assistant", "Sync", "Alerts", "Account"] as const).map((label) => (
                <View key={label} style={styles.sectionJumpChip}>
                  <Text style={styles.sectionJumpText}>{label}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.sectionHeader}>Assistant</Text>
            <Animated.View entering={FadeInDown.duration(220)} style={[styles.settingBlock, styles.sectionCard]}>
              <Text style={styles.settingLabel}>Kairo</Text>
              <Text style={styles.settingHelp}>
                Configure the provider, API key, endpoint, and model used for mobile AI assistance.
              </Text>
              <KairoSettingsSection />
            </Animated.View>

            <Text style={styles.sectionHeader}>Sync</Text>

            <Animated.View entering={FadeInDown.duration(260)} style={[styles.settingBlock, styles.sectionCard]}>
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
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(280)} style={[styles.settingBlock, styles.sectionCard]}>
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
            </Animated.View>

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

            <Animated.View entering={FadeInDown.duration(300)} style={[styles.settingBlock, styles.sectionCard]}>
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
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(320)} style={[styles.settingBlock, styles.sectionCard]}>
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
            </Animated.View>

            <Text style={styles.sectionHeader}>Account</Text>

            <Animated.View entering={FadeInDown.duration(340)} style={[styles.settingBlock, styles.sectionCard, styles.accountCard]}>
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
            </Animated.View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  settingsSheet: {
    backgroundColor: colors.bgFloating,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  settingsHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
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
  sectionJumpRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  sectionJumpChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  sectionJumpText: {
    ...typography.micro,
    color: colors.textMuted,
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
  sectionCard: {
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgCardGlass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  accountCard: {
    marginBottom: spacing.md,
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
