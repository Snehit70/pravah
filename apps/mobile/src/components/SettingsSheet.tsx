import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { NotificationPermissionState } from "../lib/notifications";
import { KairoSettingsSection } from "./KairoSettingsSection";
import { GmailReviewSection } from "./GmailReviewSection";
import type { IntegrationLastRunSummary } from "../hooks/useIntegrationsSettings";

function formatRelativeTime(ts: number | undefined): string | null {
  if (!ts) return null;
  const diff = Date.now() - ts;
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

function describeLastRun(run: IntegrationLastRunSummary | undefined): string | null {
  if (!run) return null;
  const when = formatRelativeTime(run.finishedAt);
  if (run.status === "running") return "Syncing now…";
  if (run.status === "failed") return when ? `Last sync failed · ${when}` : "Last sync failed";
  if (!when) return null;
  const counts =
    (run.importedCount ?? 0) + (run.updatedCount ?? 0) > 0
      ? ` · ${(run.importedCount ?? 0) + (run.updatedCount ?? 0)} items`
      : "";
  return `Last synced ${when}${counts}`;
}

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

type SectionKey = "assistant" | "sync" | "alerts" | "account";

const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string }> = [
  { key: "assistant", label: "Assistant" },
  { key: "sync", label: "Sync" },
  { key: "alerts", label: "Alerts" },
  { key: "account", label: "Account" },
];

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
  showToast: (next: { kind: "error" | "info"; message: string }) => void;
  calendarAccountEmail?: string;
  gmailAccountEmail?: string;
  calendarLastRun?: IntegrationLastRunSummary;
  gmailLastRun?: IntegrationLastRunSummary;
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
  showToast,
  calendarAccountEmail,
  gmailAccountEmail,
  calendarLastRun,
  gmailLastRun,
}: SettingsSheetProps) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  // Scrolled content lives inside the active tab. Reset scroll to top on tab
  // switch so each section feels like its own page rather than a remembered
  // scroll within a long scroll.
  const scrollRef = useRef<ScrollView>(null);
  const tabBarRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [activeSection, setActiveSection] = useState<SectionKey>("assistant");

  // Reset to the first tab whenever the sheet opens so users always land in
  // the same predictable place rather than wherever they last were.
  const [prevVisible, setPrevVisible] = useState(visible);
  if (prevVisible !== visible) {
    setPrevVisible(visible);
    if (visible) setActiveSection("assistant");
  }

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

  const handleSelectTab = useCallback(
    (key: SectionKey) => {
      if (key === activeSection) {
        // Tapping the active tab again jumps back to the top — matches
        // standard iOS tab-bar behavior and is the only way to scroll a
        // long-form section back up without dragging the sheet.
        scrollRef.current?.scrollTo({ y: 0, animated: !reducedMotion });
        return;
      }
      setActiveSection(key);
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    },
    [activeSection, reducedMotion],
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
          Keyboard.dismiss();
          onClose();
        }
      }}
    >
      <BottomSheetView style={styles.pinnedHeader}>
        <View style={styles.settingsHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsKicker}>Workspace</Text>
            <Text style={styles.settingsHeadline}>Settings</Text>
          </View>
          <Pressable
            onPress={() => { Keyboard.dismiss(); onClose(); }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close settings"
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.settingsCloseLink}>Close</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={tabBarRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabBarContent}
          style={styles.tabBar}
        >
          {SECTIONS.map(({ key, label }) => {
            const active = activeSection === key;
            return (
              <Pressable
                key={key}
                onPress={() => handleSelectTab(key)}
                hitSlop={8}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${label} settings`}
                style={({ pressed }) => [
                  styles.tab,
                  active && styles.tabActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </BottomSheetView>

      <BottomSheetScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.settingsScrollContent,
          { paddingBottom: insets.bottom + spacing.section },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          key={activeSection}
          entering={reducedMotion ? undefined : FadeIn.duration(160)}
        >
          {activeSection === "assistant" ? (
            <View>
              <Text style={styles.sectionHeader}>Assistant</Text>
              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Kairo</Text>
                <Text style={styles.settingHelp}>
                  Configure the provider, API key, endpoint, and model used for mobile AI assistance.
                </Text>
                <KairoSettingsSection />
              </View>
            </View>
          ) : null}

          {activeSection === "sync" ? (
            <View>
              <Text style={styles.sectionHeader}>Sync</Text>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>Google Calendar</Text>
                    <Text style={styles.settingHelp}>Pull events and deadlines into Pravah.</Text>
                    <Text style={[styles.settingStatus, { color: statusTextColor(calendarSyncStatus) }]}>
                      {formatStatusLabel(calendarSyncStatus)}
                    </Text>
                    {calendarAccountEmail ? (
                      <Text style={styles.settingMeta}>{calendarAccountEmail.toLowerCase()}</Text>
                    ) : null}
                    {describeLastRun(calendarLastRun) ? (
                      <Text style={styles.settingMeta}>{describeLastRun(calendarLastRun)}</Text>
                    ) : null}
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
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Sync Google Calendar now"
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.inlineActionText, isCalendarSyncing && styles.inlineActionDisabled]}>
                    {isCalendarSyncing ? "Syncing…" : "Sync now"}
                  </Text>
                </Pressable>
              </View>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>Gmail</Text>
                    <Text style={styles.settingHelp}>Surface pending email follow-ups for review.</Text>
                    <Text style={[styles.settingStatus, { color: statusTextColor(gmailSyncStatus) }]}>
                      {formatStatusLabel(gmailSyncStatus)}
                    </Text>
                    {gmailAccountEmail ? (
                      <Text style={styles.settingMeta}>{gmailAccountEmail.toLowerCase()}</Text>
                    ) : null}
                    {describeLastRun(gmailLastRun) ? (
                      <Text style={styles.settingMeta}>{describeLastRun(gmailLastRun)}</Text>
                    ) : null}
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
                <GmailReviewSection enabled={gmailSyncEnabled} showToast={showToast} />
              </View>

              <Pressable
                onPress={onEnableAndSyncGoogleCalendar}
                disabled={syncSettingsBusy}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Enable and sync Google Calendar"
                style={({ pressed }) => [styles.sectionFootAction, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.inlineActionText, syncSettingsBusy && styles.inlineActionDisabled]}>
                  Enable and sync Google Calendar
                </Text>
              </Pressable>
            </View>
          ) : null}

          {activeSection === "alerts" ? (
            <View>
              <Text style={styles.sectionHeader}>Alerts</Text>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Notifications</Text>
                <Text style={styles.settingHelp}>Daily reminders and test alerts for mobile follow-through.</Text>
                <Text style={[styles.settingStatus, { color: statusTextColor(notificationPermissionState) }]}>
                  {formatStatusLabel(notificationPermissionState)}
                </Text>

                {!notificationsEnabled ? (
                  <Pressable
                    onPress={onRequestNotificationsAccess}
                    disabled={isNotificationsBusy}
                    hitSlop={12}
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

              <View style={[styles.settingBlock, styles.sectionCard]}>
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
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Send a test notification"
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.inlineActionText, isNotificationsBusy && styles.inlineActionDisabled]}>
                    Send a test
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : null}

          {activeSection === "account" ? (
            <View>
              <Text style={styles.sectionHeader}>Account</Text>

              <View style={[styles.settingBlock, styles.sectionCard, styles.accountCard]}>
                <Text style={styles.settingHelp}>Sign out if you want to switch Google accounts on this device.</Text>
                <Pressable
                  onPress={onSignOut}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.signOutLink}>Sign out</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
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
  pinnedHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bgFloating,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  tabBar: {
    marginHorizontal: -spacing.lg,
  },
  tabBarContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  tab: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  tabActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  tabLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.accent,
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
    marginBottom: spacing.sm,
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
    marginBottom: spacing.sm,
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
