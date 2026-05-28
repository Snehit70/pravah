import { useCallback, useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import appJson from "../../app.json";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import Animated, { SlideInLeft, SlideInRight } from "react-native-reanimated";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { getOrCreateDeviceId } from "../lib/deviceIdentity";
import { retryQueueStorage } from "../lib/retry-queue-storage";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { classifyError, mobileLogger } from "../lib/logger";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { isWithinQuietHours, type NotificationPermissionState } from "../lib/notifications";
import { KairoSettingsSection } from "./KairoSettingsSection";
import { GmailReviewSection } from "./GmailReviewSection";
import type { GoogleCalendarOption, IntegrationLastRunSummary } from "../hooks/useIntegrationsSettings";

type QuietPickerKind = "reminder" | "quietStart" | "quietEnd";

function timeToDate(value: string): Date {
  const [h, m] = value.split(":").map((n) => Number(n));
  const d = new Date();
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

function dateToTime(d: Date): string {
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

function formatClockLabel(value: string): string {
  const [hStr, mStr] = value.split(":");
  const hour = Number(hStr);
  const minute = Number(mStr);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const period = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:${minute.toString().padStart(2, "0")} ${period}`;
}

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

type SectionKey = "assistant" | "sync" | "alerts" | "timeline" | "more";

const APP_VERSION = appJson.expo?.version ?? "—";
const REPO_URL = "https://github.com/Snehit70/pravah";
const CHANGELOG_URL = `${REPO_URL}/blob/main/apps/mobile/CHANGELOG.md`;
const ISSUES_URL = `${REPO_URL}/issues`;

type ColorKey = "purple" | "copper" | "teal" | "rose";

const COLOR_SWATCHES: ReadonlyArray<{ key: ColorKey; fill: string; label: string }> = [
  { key: "purple", fill: "#a78bfa", label: "Purple" },
  { key: "copper", fill: "#c0552d", label: "Copper" },
  { key: "teal", fill: "#4ec9b0", label: "Teal" },
  { key: "rose", fill: "#e87a90", label: "Rose" },
];

const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string }> = [
  { key: "assistant", label: "Assistant" },
  { key: "sync", label: "Sync" },
  { key: "alerts", label: "Alerts" },
  { key: "timeline", label: "Timeline" },
  { key: "more", label: "More" },
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
  onExportTasks: () => void;
  onExportDiagnostics: () => void;
  onWipeLocalData: () => Promise<void> | void;
  showToast: (next: { kind: "error" | "info"; message: string }) => void;
  calendarAccountEmail?: string;
  gmailAccountEmail?: string;
  calendarLastRun?: IntegrationLastRunSummary;
  gmailLastRun?: IntegrationLastRunSummary;
  availableCalendars: GoogleCalendarOption[];
  selectedCalendarIds: string[];
  isLoadingCalendars: boolean;
  onToggleCalendarSelected: (id: string) => void;
  calendarLastError?: string;
  gmailLastError?: string;
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
  onExportTasks,
  onExportDiagnostics,
  onWipeLocalData,
  showToast,
  calendarAccountEmail,
  gmailAccountEmail,
  calendarLastRun,
  gmailLastRun,
  availableCalendars,
  selectedCalendarIds,
  isLoadingCalendars,
  onToggleCalendarSelected,
  calendarLastError,
  gmailLastError,
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
  // Track the direction of the most recent tab change so content can slide in
  // from the side matching the user's spatial mental model of the tab bar.
  const [tabDirection, setTabDirection] = useState<"forward" | "backward">("forward");
  const { prefs, setPreference } = useUserPreferences();
  const [openPicker, setOpenPicker] = useState<QuietPickerKind | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isClearingRetryQueue, setIsClearingRetryQueue] = useState(false);
  const [dangerArmed, setDangerArmed] = useState<"wipe" | null>(null);
  const [isWiping, setIsWiping] = useState(false);

  // Disarm the danger button after a few seconds so a stray re-tap doesn't
  // execute a destructive action long after the user moved on.
  useEffect(() => {
    if (!dangerArmed) return;
    const t = setTimeout(() => setDangerArmed(null), 5000);
    return () => clearTimeout(t);
  }, [dangerArmed]);

  const handleWipeLocalData = useCallback(async () => {
    if (dangerArmed !== "wipe") {
      setDangerArmed("wipe");
      return;
    }
    setDangerArmed(null);
    setIsWiping(true);
    try {
      await onWipeLocalData();
      showToast({ kind: "info", message: "Local data wiped." });
    } catch (error) {
      mobileLogger.warn("wipe_local_data_failed", { errorType: classifyError(error) });
      showToast({ kind: "error", message: "Could not wipe local data." });
    } finally {
      setIsWiping(false);
    }
  }, [dangerArmed, onWipeLocalData, showToast]);

  // Lazy-load device id only when the More tab (which contains Diagnostics)
  // is opened. Avoids touching storage on every settings open.
  useEffect(() => {
    if (activeSection !== "more" || deviceId) return;
    void getOrCreateDeviceId().then(setDeviceId);
  }, [activeSection, deviceId]);

  const handleCopy = useCallback(
    async (value: string, label: string) => {
      try {
        await Clipboard.setStringAsync(value);
        showToast({ kind: "info", message: `${label} copied.` });
      } catch (error) {
        mobileLogger.warn("clipboard_copy_failed", { errorType: classifyError(error) });
        showToast({ kind: "error", message: `Could not copy ${label.toLowerCase()}.` });
      }
    },
    [showToast]
  );

  const handleClearRetryQueue = useCallback(async () => {
    if (isClearingRetryQueue) return;
    setIsClearingRetryQueue(true);
    try {
      await retryQueueStorage.removeItem("pravah_mobile_retry_queue_v1");
      // Also clear the legacy SecureStore copy; if left behind it would be
      // migrated back into AsyncStorage on the next read.
      await SecureStore.deleteItemAsync("pravah_mobile_retry_queue_v1").catch(() => undefined);
      showToast({ kind: "info", message: "Retry queue cleared." });
    } catch (error) {
      mobileLogger.warn("retry_queue_clear_failed", { errorType: classifyError(error) });
      showToast({ kind: "error", message: "Could not clear retry queue." });
    } finally {
      setIsClearingRetryQueue(false);
    }
  }, [isClearingRetryQueue, showToast]);

  const handleTimePicked = useCallback(
    (kind: QuietPickerKind) => (_event: DateTimePickerEvent, picked?: Date) => {
      if (Platform.OS === "android") setOpenPicker(null);
      if (!picked) return;
      const value = dateToTime(picked);
      if (kind === "reminder") void setPreference("dailyReminderTime", value);
      else if (kind === "quietStart") void setPreference("quietHoursStart", value);
      else void setPreference("quietHoursEnd", value);
    },
    [setPreference],
  );

  const reminderInQuietHours = isWithinQuietHours(prefs.dailyReminderTime, {
    enabled: prefs.quietHoursEnabled,
    start: prefs.quietHoursStart,
    end: prefs.quietHoursEnd,
  });

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
      const prevIndex = SECTIONS.findIndex((s) => s.key === activeSection);
      const nextIndex = SECTIONS.findIndex((s) => s.key === key);
      setTabDirection(nextIndex > prevIndex ? "forward" : "backward");
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
      <View style={styles.pinnedHeader}>
        <View style={styles.settingsHeader}>
          <View style={{ flex: 1 }}>
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
      </View>

      <BottomSheetScrollView
        ref={scrollRef}
        style={styles.settingsScroll}
        contentContainerStyle={[
          styles.settingsScrollContent,
          { paddingBottom: insets.bottom + spacing.section },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View
          key={activeSection}
          entering={
            reducedMotion
              ? undefined
              : tabDirection === "forward"
                ? SlideInRight.duration(180)
                : SlideInLeft.duration(180)
          }
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

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Behavior</Text>
                <Text style={styles.settingHelp}>
                  Tune how Kairo responds and how long undo stays available.
                </Text>

                <View style={styles.behaviorRow}>
                  <Text style={styles.settingMeta}>Temperature</Text>
                  <View style={styles.stepperRow}>
                    <Pressable
                      onPress={() =>
                        void setPreference(
                          "kairoTemperature",
                          Math.max(0, Math.round((prefs.kairoTemperature - 0.1) * 10) / 10),
                        )
                      }
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Decrease Kairo temperature"
                      style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.stepperGlyph}>−</Text>
                    </Pressable>
                    <Text style={styles.stepperValue}>{prefs.kairoTemperature.toFixed(1)}</Text>
                    <Pressable
                      onPress={() =>
                        void setPreference(
                          "kairoTemperature",
                          Math.min(1.5, Math.round((prefs.kairoTemperature + 0.1) * 10) / 10),
                        )
                      }
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Increase Kairo temperature"
                      style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.stepperGlyph}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.behaviorRow}>
                  <Text style={styles.settingMeta}>Response style</Text>
                  <View style={styles.chipRow}>
                    {(["concise", "detailed"] as const).map((style) => {
                      const active = prefs.kairoResponseStyle === style;
                      return (
                        <Pressable
                          key={style}
                          onPress={() => void setPreference("kairoResponseStyle", style)}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={({ pressed }) => [
                            styles.choiceChip,
                            active && styles.choiceChipActive,
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                            {style === "concise" ? "Concise" : "Detailed"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.behaviorRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingMeta}>Starter pills</Text>
                  </View>
                  <Switch
                    value={prefs.kairoStarterPillsEnabled}
                    onValueChange={(next) => void setPreference("kairoStarterPillsEnabled", next)}
                    trackColor={{ false: colors.border, true: colors.accentSoft }}
                    thumbColor={prefs.kairoStarterPillsEnabled ? colors.accent : colors.textMuted}
                  />
                </View>

                <View style={styles.behaviorRow}>
                  <Text style={styles.settingMeta}>Undo window</Text>
                  <View style={styles.chipRow}>
                    {([5, 15, 30, 60] as const).map((minutes) => {
                      const active = prefs.kairoUndoWindowMinutes === minutes;
                      return (
                        <Pressable
                          key={minutes}
                          onPress={() => void setPreference("kairoUndoWindowMinutes", minutes)}
                          hitSlop={6}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={({ pressed }) => [
                            styles.choiceChip,
                            active && styles.choiceChipActive,
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
                            {minutes}m
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
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
                {calendarSyncEnabled ? (
                  <View style={styles.calendarPickerBlock}>
                    <View style={styles.calendarPickerHeaderRow}>
                      <Text style={styles.settingMeta}>
                        Calendars
                        {availableCalendars.length > 0
                          ? ` · ${selectedCalendarIds.length || availableCalendars.length}/${availableCalendars.length}`
                          : ""}
                      </Text>
                      {isLoadingCalendars ? (
                        <Text style={styles.settingMeta}>Loading…</Text>
                      ) : null}
                    </View>
                    {!isLoadingCalendars && availableCalendars.length === 0 ? (
                      <Text style={styles.settingMeta}>
                        Calendar list unavailable. All accessible calendars will be imported.
                      </Text>
                    ) : null}
                    {availableCalendars.map((calendar) => {
                      const checked =
                        selectedCalendarIds.length === 0 || selectedCalendarIds.includes(calendar.id);
                      return (
                        <Pressable
                          key={calendar.id}
                          onPress={() => onToggleCalendarSelected(calendar.id)}
                          hitSlop={6}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked }}
                          accessibilityLabel={`Sync ${calendar.summary}${calendar.primary ? ", primary" : ""}`}
                          style={({ pressed }) => [
                            styles.calendarPickerRow,
                            pressed && { opacity: 0.6 },
                          ]}
                        >
                          <View style={[styles.calendarCheckbox, checked && styles.calendarCheckboxChecked]}>
                            {checked ? <Text style={styles.calendarCheckmark}>✓</Text> : null}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.settingLabel} numberOfLines={1}>
                              {calendar.summary}
                            </Text>
                            {calendar.primary ? (
                              <Text style={styles.settingMeta}>Primary</Text>
                            ) : null}
                          </View>
                        </Pressable>
                      );
                    })}
                    {availableCalendars.length > 0 && selectedCalendarIds.length === 0 ? (
                      <Text style={styles.settingMeta}>
                        No calendars selected — sync will pull all of them.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
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
                    <Text style={styles.settingHelp}>
                      Send one reminder every day at the time you choose.
                    </Text>
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
                  onPress={() => setOpenPicker("reminder")}
                  disabled={!isDailyReminderEnabled || isNotificationsBusy}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Change reminder time, currently ${formatClockLabel(prefs.dailyReminderTime)}`}
                  style={({ pressed }) => [
                    styles.timeRow,
                    !isDailyReminderEnabled && { opacity: 0.5 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.settingMeta}>Reminder time</Text>
                  <Text style={styles.timeRowValue}>{formatClockLabel(prefs.dailyReminderTime)}</Text>
                </Pressable>

                {reminderInQuietHours ? (
                  <Text style={[styles.settingMeta, { color: colors.accent }]}>
                    This time falls within your quiet hours — the reminder will still fire.
                  </Text>
                ) : null}

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

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>Quiet hours</Text>
                    <Text style={styles.settingHelp}>
                      A window where notifications are paused. Applies to future
                      ad-hoc alerts; daily reminders still fire.
                    </Text>
                  </View>
                  <Switch
                    value={prefs.quietHoursEnabled}
                    onValueChange={(next) => void setPreference("quietHoursEnabled", next)}
                    trackColor={{ false: colors.border, true: colors.accentSoft }}
                    thumbColor={prefs.quietHoursEnabled ? colors.accent : colors.textMuted}
                  />
                </View>

                <Pressable
                  onPress={() => setOpenPicker("quietStart")}
                  disabled={!prefs.quietHoursEnabled}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Change quiet hours start, currently ${formatClockLabel(prefs.quietHoursStart)}`}
                  style={({ pressed }) => [
                    styles.timeRow,
                    !prefs.quietHoursEnabled && { opacity: 0.5 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.settingMeta}>Starts</Text>
                  <Text style={styles.timeRowValue}>{formatClockLabel(prefs.quietHoursStart)}</Text>
                </Pressable>

                <Pressable
                  onPress={() => setOpenPicker("quietEnd")}
                  disabled={!prefs.quietHoursEnabled}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`Change quiet hours end, currently ${formatClockLabel(prefs.quietHoursEnd)}`}
                  style={({ pressed }) => [
                    styles.timeRow,
                    !prefs.quietHoursEnabled && { opacity: 0.5 },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.settingMeta}>Ends</Text>
                  <Text style={styles.timeRowValue}>{formatClockLabel(prefs.quietHoursEnd)}</Text>
                </Pressable>
              </View>

              {openPicker !== null ? (
                <DateTimePicker
                  value={timeToDate(
                    openPicker === "reminder"
                      ? prefs.dailyReminderTime
                      : openPicker === "quietStart"
                        ? prefs.quietHoursStart
                        : prefs.quietHoursEnd,
                  )}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={handleTimePicked(openPicker)}
                />
              ) : null}
            </View>
          ) : null}

          {activeSection === "timeline" ? (
            <View>
              <Text style={styles.sectionHeader}>Timeline</Text>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Defaults</Text>
                <Text style={styles.settingHelp}>
                  Control how the timeline plans your week and sizes new tasks.
                </Text>

                <View style={styles.fieldStack}>
                  <Text style={styles.fieldLabel}>Week starts on</Text>
                  <View style={styles.segmented}>
                    {(["monday", "sunday"] as const).map((day) => {
                      const active = prefs.weekStart === day;
                      return (
                        <Pressable
                          key={day}
                          onPress={() => void setPreference("weekStart", day)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={({ pressed }) => [
                            styles.segment,
                            active && styles.segmentActive,
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                            {day === "monday" ? "Monday" : "Sunday"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.behaviorRow}>
                  <Text style={styles.settingMeta}>Default task duration</Text>
                  <View style={styles.stepperRow}>
                    <Pressable
                      onPress={() =>
                        void setPreference(
                          "defaultTaskDurationMin",
                          Math.max(5, prefs.defaultTaskDurationMin - 5),
                        )
                      }
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Decrease default task duration"
                      style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.stepperGlyph}>−</Text>
                    </Pressable>
                    <Text style={styles.stepperValue}>{prefs.defaultTaskDurationMin}m</Text>
                    <Pressable
                      onPress={() =>
                        void setPreference(
                          "defaultTaskDurationMin",
                          Math.min(480, prefs.defaultTaskDurationMin + 5),
                        )
                      }
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Increase default task duration"
                      style={({ pressed }) => [styles.stepperButton, pressed && { opacity: 0.6 }]}
                    >
                      <Text style={styles.stepperGlyph}>+</Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.fieldStack}>
                  <Text style={styles.fieldLabel}>Task color scheme</Text>
                  <View style={styles.swatchRow}>
                    {COLOR_SWATCHES.map(({ key, fill, label }) => {
                      const active = prefs.taskColorScheme === key;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => void setPreference("taskColorScheme", key)}
                          accessibilityRole="button"
                          accessibilityLabel={`${label} task color`}
                          accessibilityState={{ selected: active }}
                          style={({ pressed }) => [styles.swatchItem, pressed && { opacity: 0.7 }]}
                        >
                          <View style={[styles.swatch, { backgroundColor: fill }, active && styles.swatchActive]}>
                            {active ? <Text style={styles.swatchCheck}>✓</Text> : null}
                          </View>
                          <Text style={[styles.swatchLabel, active && styles.swatchLabelActive]}>
                            {label}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>

              <Text style={styles.sectionHeader}>Appearance</Text>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Motion & density</Text>
                <Text style={styles.settingHelp}>
                  Override the system motion setting and tighten spacing.
                </Text>

                <View style={styles.fieldStack}>
                  <Text style={styles.fieldLabel}>Reduced motion</Text>
                  <View style={styles.segmented}>
                    {(["system", "always", "never"] as const).map((mode) => {
                      const active = prefs.reducedMotionOverride === mode;
                      return (
                        <Pressable
                          key={mode}
                          onPress={() => void setPreference("reducedMotionOverride", mode)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={({ pressed }) => [
                            styles.segment,
                            active && styles.segmentActive,
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                            {mode === "system" ? "System" : mode === "always" ? "On" : "Off"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <View style={styles.fieldStack}>
                  <Text style={styles.fieldLabel}>Density</Text>
                  <View style={styles.segmented}>
                    {(["cozy", "compact"] as const).map((d) => {
                      const active = prefs.density === d;
                      return (
                        <Pressable
                          key={d}
                          onPress={() => void setPreference("density", d)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                          style={({ pressed }) => [
                            styles.segment,
                            active && styles.segmentActive,
                            pressed && { opacity: 0.7 },
                          ]}
                        >
                          <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                            {d === "cozy" ? "Cozy" : "Compact"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              </View>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Accent color</Text>
                <Text style={styles.settingHelp}>
                  Used for highlights, buttons, and active states.
                </Text>
                <View style={styles.swatchRow}>
                  {COLOR_SWATCHES.map(({ key, fill, label }) => {
                    const active = prefs.accentColor === key;
                    return (
                      <Pressable
                        key={key}
                        onPress={() => void setPreference("accentColor", key)}
                        accessibilityRole="button"
                        accessibilityLabel={`${label} accent color`}
                        accessibilityState={{ selected: active }}
                        style={({ pressed }) => [styles.swatchItem, pressed && { opacity: 0.7 }]}
                      >
                        <View style={[styles.swatch, { backgroundColor: fill }, active && styles.swatchActive]}>
                          {active ? <Text style={styles.swatchCheck}>✓</Text> : null}
                        </View>
                        <Text style={[styles.swatchLabel, active && styles.swatchLabelActive]}>
                          {label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          ) : null}

          {activeSection === "more" ? (
            <View>
              <Text style={styles.sectionHeader}>Diagnostics</Text>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Device</Text>
                <Text style={styles.settingHelp}>
                  Share this ID with support when reporting a bug.
                </Text>
                <View style={styles.copyRow}>
                  <View style={[styles.codePill, styles.copyRowPill]}>
                    <Text selectable style={styles.codePillText} numberOfLines={1}>
                      {deviceId ?? "Loading…"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => deviceId && void handleCopy(deviceId, "Device ID")}
                    disabled={!deviceId}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Copy device ID"
                    style={({ pressed }) => [
                      styles.copyButton,
                      pressed && { opacity: 0.6 },
                      !deviceId && styles.softButtonDisabled,
                    ]}
                  >
                    <Text style={styles.copyButtonText}>Copy</Text>
                  </Pressable>
                </View>
              </View>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Diagnostics bundle</Text>
                <Text style={styles.settingHelp}>
                  Export recent app events, device metadata, and sync state as a JSON file.
                </Text>
                <Pressable
                  onPress={onExportDiagnostics}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Export diagnostics"
                  style={({ pressed }) => [styles.softButton, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.softButtonText}>Export diagnostics</Text>
                </Pressable>
              </View>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Recent sync errors</Text>
                <Text style={styles.settingHelp}>
                  From the most recent Google Calendar and Gmail sync runs.
                </Text>

                <View style={styles.sourceBlock}>
                  <View style={styles.sourceHeader}>
                    <View
                      style={[
                        styles.statusDot,
                        calendarLastError ? styles.statusDotErr : styles.statusDotOk,
                      ]}
                    />
                    <Text style={styles.sourceName}>Google Calendar</Text>
                    <Text
                      style={[
                        styles.sourceStatus,
                        calendarLastError ? styles.sourceStatusErr : styles.sourceStatusOk,
                      ]}
                    >
                      {calendarLastError ? "Error" : "Healthy"}
                    </Text>
                    {calendarLastError ? (
                      <Pressable
                        onPress={() => void handleCopy(calendarLastError, "Calendar error")}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Copy Google Calendar error"
                        style={({ pressed }) => [styles.copyChip, pressed && { opacity: 0.6 }]}
                      >
                        <Text style={styles.copyChipText}>Copy</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {calendarLastError ? (
                    <View style={styles.errorBlock}>
                      <Text selectable style={styles.errorBlockText}>
                        {calendarLastError}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.sourceBlock}>
                  <View style={styles.sourceHeader}>
                    <View
                      style={[
                        styles.statusDot,
                        gmailLastError ? styles.statusDotErr : styles.statusDotOk,
                      ]}
                    />
                    <Text style={styles.sourceName}>Gmail</Text>
                    <Text
                      style={[
                        styles.sourceStatus,
                        gmailLastError ? styles.sourceStatusErr : styles.sourceStatusOk,
                      ]}
                    >
                      {gmailLastError ? "Error" : "Healthy"}
                    </Text>
                    {gmailLastError ? (
                      <Pressable
                        onPress={() => void handleCopy(gmailLastError, "Gmail error")}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Copy Gmail error"
                        style={({ pressed }) => [styles.copyChip, pressed && { opacity: 0.6 }]}
                      >
                        <Text style={styles.copyChipText}>Copy</Text>
                      </Pressable>
                    ) : null}
                  </View>
                  {gmailLastError ? (
                    <View style={styles.errorBlock}>
                      <Text selectable style={styles.errorBlockText}>
                        {gmailLastError}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Retry queue</Text>
                <Text style={styles.settingHelp}>
                  Drops any pending offline retries. Use if a stuck request is preventing
                  fresh syncs from running.
                </Text>
                <Pressable
                  onPress={() => void handleClearRetryQueue()}
                  disabled={isClearingRetryQueue}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Clear retry queue"
                  style={({ pressed }) => [
                    styles.softButton,
                    pressed && { opacity: 0.6 },
                    isClearingRetryQueue && styles.softButtonDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.softButtonText,
                      isClearingRetryQueue && styles.inlineActionDisabled,
                    ]}
                  >
                    {isClearingRetryQueue ? "Clearing…" : "Clear retry queue"}
                  </Text>
                </Pressable>
              </View>

              <Text style={styles.sectionHeader}>About</Text>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <View style={styles.aboutHeader}>
                  <View style={styles.aboutHeaderCopy}>
                    <Text style={styles.settingLabel}>Pravah Mobile</Text>
                    <Text style={styles.aboutVersion}>Version {APP_VERSION}</Text>
                  </View>
                  <Pressable
                    onPress={() => void Linking.openURL(CHANGELOG_URL)}
                    hitSlop={12}
                    accessibilityRole="link"
                    accessibilityLabel="Open changelog on GitHub"
                    style={({ pressed }) => [styles.versionPill, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.versionPillText}>What's new</Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={() => void Linking.openURL(ISSUES_URL)}
                  hitSlop={12}
                  accessibilityRole="link"
                  accessibilityLabel="Report an issue on GitHub"
                  style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.linkRowText}>Report an issue</Text>
                  <Text style={styles.linkRowChevron}>↗</Text>
                </Pressable>
                <Pressable
                  onPress={() => void Linking.openURL(REPO_URL)}
                  hitSlop={12}
                  accessibilityRole="link"
                  accessibilityLabel="Open Pravah repository on GitHub"
                  style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.linkRowText}>GitHub repository</Text>
                  <Text style={styles.linkRowChevron}>↗</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionHeader}>Account</Text>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Your data</Text>
                <Text style={styles.settingHelp}>
                  Export every task currently in view as a JSON payload via the system share
                  sheet (save to Files, email, or another app).
                </Text>
                <Pressable
                  onPress={onExportTasks}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Export tasks as JSON"
                  style={({ pressed }) => [styles.softButton, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.softButtonText}>Export tasks as JSON</Text>
                </Pressable>
              </View>

              <View style={[styles.settingBlock, styles.sectionCard, styles.accountCard]}>
                <Text style={styles.settingLabel}>Signed in</Text>
                <Text style={styles.settingHelp}>
                  Sign out if you want to switch Google accounts on this device.
                </Text>
                <Pressable
                  onPress={onSignOut}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  style={({ pressed }) => [styles.signOutButton, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.signOutLink}>Sign out</Text>
                </Pressable>
              </View>

              <View style={[styles.settingBlock, styles.sectionCard, styles.dangerCard]}>
                <Text style={styles.dangerLabel}>Danger zone</Text>
                <Text style={styles.settingHelp}>
                  Wipe locally cached preferences, retry queue, snapshot, and reminder
                  schedule. Server data is untouched. Signs you out.
                </Text>
                <Pressable
                  onPress={() => void handleWipeLocalData()}
                  disabled={isWiping}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={
                    dangerArmed === "wipe" ? "Tap again to confirm wipe" : "Wipe local data"
                  }
                  style={({ pressed }) => [styles.sectionFootAction, pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.dangerActionText, isWiping && styles.inlineActionDisabled]}>
                    {isWiping
                      ? "Wiping…"
                      : dangerArmed === "wipe"
                        ? "Tap again to confirm →"
                        : "Wipe local data"}
                  </Text>
                </Pressable>

                <Text style={[styles.settingHelp, { marginTop: spacing.sm }]}>
                  To permanently delete your Pravah account and server data, open a
                  request with support.
                </Text>
                <Pressable
                  onPress={() => void Linking.openURL(`${ISSUES_URL}/new?title=Delete+my+Pravah+account`)}
                  hitSlop={12}
                  accessibilityRole="link"
                  accessibilityLabel="Request account deletion via GitHub issue"
                  style={({ pressed }) => [styles.sectionFootAction, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.dangerActionText}>Request account deletion →</Text>
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
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
  },
  settingsHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  settingsScroll: {
    flex: 1,
  },
  settingsScrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  pinnedHeader: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.bg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "center",
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
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  tabActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  tabLabel: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  tabLabelActive: {
    color: colors.accent,
    fontWeight: "600",
  },
  settingsHeadline: {
    ...typography.headline,
    color: colors.textPrimary,
    marginTop: 2,
  },
  settingsCloseLink: {
    ...typography.bodyMd,
    color: colors.accent,
  },
  sectionHeader: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontWeight: "600",
    marginTop: spacing.xl,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
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
  calendarPickerBlock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  calendarPickerHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  calendarPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  calendarCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
  },
  calendarCheckboxChecked: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  calendarCheckmark: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: "700",
  },
  behaviorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepperGlyph: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  stepperValue: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    minWidth: 36,
    textAlign: "center",
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.xs,
    flexWrap: "wrap",
    justifyContent: "flex-end",
  },
  fieldStack: {
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    gap: spacing.sm,
  },
  fieldLabel: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    padding: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
  },
  segmentActive: {
    backgroundColor: colors.accentSoft,
  },
  segmentText: {
    ...typography.micro,
    color: colors.textMuted,
    textAlign: "center",
  },
  segmentTextActive: {
    color: colors.accent,
    fontWeight: "600",
  },
  swatchRow: {
    flexDirection: "row",
    gap: spacing.lg,
    flexWrap: "wrap",
  },
  swatchItem: {
    alignItems: "center",
    gap: spacing.xs,
  },
  swatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchActive: {
    borderColor: colors.textPrimary,
  },
  swatchCheck: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 18,
  },
  swatchLabel: {
    ...typography.micro,
    color: colors.textMuted,
  },
  swatchLabelActive: {
    color: colors.textPrimary,
    fontWeight: "600",
  },
  choiceChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  choiceChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  choiceChipText: {
    ...typography.micro,
    color: colors.textMuted,
  },
  choiceChipTextActive: {
    color: colors.accent,
    fontWeight: "600",
  },
  diagnosticsCode: {
    ...typography.micro,
    color: colors.textPrimary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    paddingVertical: spacing.xs,
  },
  dangerCard: {
    borderColor: "#c0552d",
  },
  dangerLabel: {
    ...typography.bodyMd,
    color: "#c0552d",
    fontWeight: "600",
    marginBottom: spacing.xs,
  },
  dangerActionText: {
    ...typography.micro,
    color: "#c0552d",
    fontWeight: "600",
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
    marginTop: spacing.xs,
  },
  timeRowValue: {
    ...typography.bodyMd,
    color: colors.accent,
  },
  signOutLink: {
    color: colors.error,
    ...typography.micro,
    fontWeight: "600",
  },
  signOutButton: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.error,
    marginTop: spacing.xs,
  },
  codePill: {
    alignSelf: "flex-start",
    backgroundColor: colors.bgCard,
    borderRadius: 8,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    marginTop: spacing.xs,
  },
  codePillText: {
    ...typography.micro,
    color: colors.textPrimary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  sourceBlock: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  sourceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOk: {
    backgroundColor: colors.success,
  },
  statusDotErr: {
    backgroundColor: colors.error,
  },
  sourceName: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    flex: 1,
  },
  sourceStatus: {
    ...typography.micro,
    fontWeight: "600",
  },
  sourceStatusOk: {
    color: colors.success,
  },
  sourceStatusErr: {
    color: colors.error,
  },
  errorBlock: {
    backgroundColor: colors.bgCard,
    borderRadius: 8,
    padding: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  errorBlockText: {
    ...typography.micro,
    color: colors.textSecondary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    lineHeight: 16,
  },
  softButton: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    marginTop: spacing.xs,
  },
  softButtonDisabled: {
    opacity: 0.5,
  },
  softButtonText: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: "600",
  },
  aboutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  aboutHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  aboutVersion: {
    ...typography.micro,
    color: colors.textMuted,
  },
  versionPill: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
  },
  versionPillText: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: "600",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  linkRowText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  linkRowChevron: {
    color: colors.textMuted,
    fontSize: 16,
  },
  copyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  copyRowPill: {
    flex: 1,
    marginTop: 0,
  },
  copyButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
  },
  copyButtonText: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: "600",
  },
  copyChip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgCard,
  },
  copyChipText: {
    ...typography.micro,
    color: colors.textSecondary,
    fontWeight: "600",
  },
});
