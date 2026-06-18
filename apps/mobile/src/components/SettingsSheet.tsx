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
  TextInput,
  View,
} from "react-native";
import { useMutation, useQuery } from "convex/react";
import appJson from "../../app.json";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from "@gorhom/bottom-sheet";
import Animated, { SlideInLeft, SlideInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { getOrCreateDeviceId } from "../lib/deviceIdentity";
import { retryQueueStorage } from "../lib/retry-queue-storage";
import {
  moveTabOrder,
  resolveTabOrder,
  TAB_LABELS,
  type TabKey,
} from "../lib/tabOrder";
import * as SecureStore from "expo-secure-store";
import * as Clipboard from "expo-clipboard";
import { classifyError, mobileLogger } from "../lib/logger";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { NotificationPermissionState } from "../lib/notifications";
import { KairoSettingsSection } from "./KairoSettingsSection";
import { GmailReviewSection } from "./GmailReviewSection";
import type { GoogleCalendarOption, IntegrationLastRunSummary, SyncHealth } from "../hooks/useIntegrationsSettings";
import { summarizeSyncError } from "../hooks/useIntegrationsSettings";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { SnapWheelTimePicker } from "./SnapWheelTimePicker";

type QuietPickerKind = "morningDigest" | "quietStart" | "quietEnd";

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

function syncHealthLabel(health: SyncHealth): string {
  switch (health) {
    case "healthy":
      return "Connected";
    case "error":
      return "Sync paused after an error";
    case "paused":
      return "Sync off";
    case "disconnected":
      return "Not connected";
  }
}

function syncHealthColor(health: SyncHealth): string {
  if (health === "healthy") return colors.primary;
  if (health === "error") return colors.error;
  return colors.textMuted;
}

function pickerTitle(kind: QuietPickerKind): string {
  if (kind === "morningDigest") return "Morning digest";
  if (kind === "quietStart") return "Quiet hours start";
  return "Quiet hours end";
}

function pickerValue(kind: QuietPickerKind, prefs: {
  morningDigestTime: string;
  quietHoursStart: string;
  quietHoursEnd: string;
}): string {
  if (kind === "morningDigest") return prefs.morningDigestTime;
  if (kind === "quietStart") return prefs.quietHoursStart;
  return prefs.quietHoursEnd;
}

// Context-aware primary action for the calendar block, replacing the old pair
// of "Sync now" + "Enable and sync" rows.
function calendarActionLabel(health: SyncHealth, isSyncing: boolean): string {
  if (isSyncing) return "Syncing…";
  if (health === "error") return "Reconnect";
  if (health === "paused" || health === "disconnected") return "Enable and sync";
  return "Sync now";
}

type SectionKey = "assistant" | "sync" | "alerts" | "timeline" | "more";
const REMINDER_LEAD_TIME_OPTIONS = [5, 15, 30, 60] as const;

const READ_ONLY_AUTOMATION_SCOPES = ["tasks:read", "review:read", "sync:read"] as const;

const APP_VERSION = appJson.expo?.version ?? "—";
const REPO_URL = "https://github.com/Snehit70/pravah";
const CHANGELOG_URL = `${REPO_URL}/blob/main/apps/mobile/CHANGELOG.md`;
const ISSUES_URL = `${REPO_URL}/issues`;

const SECTIONS: ReadonlyArray<{ key: SectionKey; label: string }> = [
  { key: "assistant", label: "Assistant" },
  { key: "sync", label: "Sync" },
  { key: "alerts", label: "Reminders" },
  { key: "timeline", label: "Timeline" },
  { key: "more", label: "More" },
];

type TabOrderEditorProps = {
  order: readonly TabKey[];
  onMove: (key: TabKey, direction: "up" | "down") => void;
};

function TabOrderPreview({ order }: { order: readonly TabKey[] }) {
  const left = order.slice(0, 2);
  const right = order.slice(2);
  return (
    <View style={styles.tabOrderPreview} testID="tab-order-preview">
      {left.map((key) => (
        <View key={key} style={styles.tabPreviewItem}>
          <Text style={styles.tabPreviewText}>{TAB_LABELS[key]}</Text>
        </View>
      ))}
      <View style={styles.tabPreviewCapture}>
        <Text style={styles.tabPreviewCaptureText}>Capture</Text>
      </View>
      {right.map((key) => (
        <View key={key} style={styles.tabPreviewItem}>
          <Text style={styles.tabPreviewText}>{TAB_LABELS[key]}</Text>
        </View>
      ))}
    </View>
  );
}

function TabOrderEditor({ order, onMove }: TabOrderEditorProps) {
  return (
    <View style={styles.tabOrderEditor}>
      {order.map((key, index) => {
        const isFirst = index === 0;
        const isLast = index === order.length - 1;
        return (
          <View key={key} style={styles.tabOrderRow}>
            <View style={styles.tabOrderIndex}>
              <Text style={styles.tabOrderIndexText}>{index + 1}</Text>
            </View>
            <View style={styles.settingCopy}>
              <Text style={styles.settingLabel}>{TAB_LABELS[key]}</Text>
              <Text style={styles.settingMeta}>
                {index < 2 ? "Left of Capture" : "Right of Capture"}
              </Text>
            </View>
            <View style={styles.tabOrderControls}>
              <Pressable
                onPress={() => onMove(key, "up")}
                disabled={isFirst}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Move ${TAB_LABELS[key]} up`}
                accessibilityState={{ disabled: isFirst }}
                style={({ pressed }) => [
                  styles.tabOrderButton,
                  isFirst && styles.tabOrderButtonDisabled,
                  pressed && !isFirst && { opacity: 0.65 },
                ]}
              >
                <Text
                  style={[
                    styles.tabOrderButtonText,
                    isFirst && styles.tabOrderButtonTextDisabled,
                  ]}
                >
                  ↑
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onMove(key, "down")}
                disabled={isLast}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Move ${TAB_LABELS[key]} down`}
                accessibilityState={{ disabled: isLast }}
                style={({ pressed }) => [
                  styles.tabOrderButton,
                  isLast && styles.tabOrderButtonDisabled,
                  pressed && !isLast && { opacity: 0.65 },
                ]}
              >
                <Text
                  style={[
                    styles.tabOrderButtonText,
                    isLast && styles.tabOrderButtonTextDisabled,
                  ]}
                >
                  ↓
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

type SettingsSheetProps = {
  visible: boolean;
  calendarSyncEnabled: boolean;
  gmailSyncEnabled: boolean;
  gmailSyncStatus: string;
  calendarSyncHealth: SyncHealth;
  calendarErrorSummary?: string;
  canToggleGmailSync: boolean;
  pendingGmailReviewCount: number;
  notificationPermissionState: NotificationPermissionState;
  notificationsEnabled: boolean;
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
  gmailSyncStatus,
  calendarSyncHealth,
  calendarErrorSummary,
  canToggleGmailSync,
  pendingGmailReviewCount,
  notificationPermissionState,
  notificationsEnabled,
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
  const tabOrder = resolveTabOrder(prefs.tabOrder);
  const [openPicker, setOpenPicker] = useState<QuietPickerKind | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isClearingRetryQueue, setIsClearingRetryQueue] = useState(false);
  const [dangerArmed, setDangerArmed] = useState<"wipe" | null>(null);
  const [isWiping, setIsWiping] = useState(false);
  const [automationLabel, setAutomationLabel] = useState("Codex local");
  const [allowTaskWrites, setAllowTaskWrites] = useState(false);
  const [issuedBootstrapToken, setIssuedBootstrapToken] = useState<{
    token: string;
    expiresAt: number;
  } | null>(null);
  const [isIssuingBootstrapToken, setIsIssuingBootstrapToken] = useState(false);
  const [revokingCredentialId, setRevokingCredentialId] =
    useState<Id<"automationCredentials"> | null>(null);
  const issueBootstrapToken = useMutation(api.automation.issueBootstrapToken);
  const revokeCredential = useMutation(api.automation.revokeCredential);
  const automationCredentials = useQuery(api.automation.listCredentials, {}) ?? [];

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

  const handleIssueBootstrapToken = useCallback(async () => {
    const trimmedLabel = automationLabel.trim();
    if (!trimmedLabel) {
      showToast({ kind: "error", message: "Enter a credential label." });
      return;
    }

    setIsIssuingBootstrapToken(true);
    try {
      const scopes = allowTaskWrites
        ? [...READ_ONLY_AUTOMATION_SCOPES, "tasks:write" as const]
        : [...READ_ONLY_AUTOMATION_SCOPES];
      const result = await issueBootstrapToken({
        label: trimmedLabel,
        scopes,
        ttlMinutes: 15,
      });
      setIssuedBootstrapToken({ token: result.bootstrapToken, expiresAt: result.expiresAt });
      await Clipboard.setStringAsync(result.bootstrapToken);
      showToast({ kind: "info", message: "Bootstrap token issued and copied." });
    } catch (error) {
      mobileLogger.warn("automation_bootstrap_issue_failed", { errorType: classifyError(error) });
      showToast({ kind: "error", message: "Could not issue bootstrap token." });
    } finally {
      setIsIssuingBootstrapToken(false);
    }
  }, [allowTaskWrites, automationLabel, issueBootstrapToken, showToast]);

  const handleRevokeCredential = useCallback(
    async (credentialId: Id<"automationCredentials">) => {
      setRevokingCredentialId(credentialId);
      try {
        await revokeCredential({ credentialId });
        showToast({ kind: "info", message: "Automation credential revoked." });
      } catch (error) {
        mobileLogger.warn("automation_credential_revoke_failed", {
          errorType: classifyError(error),
        });
        showToast({ kind: "error", message: "Could not revoke credential." });
      } finally {
        setRevokingCredentialId(null);
      }
    },
    [revokeCredential, showToast]
  );

  const handleTimePicked = useCallback(
    (kind: QuietPickerKind, value: string) => {
      if (kind === "morningDigest") void setPreference("morningDigestTime", value);
      else if (kind === "quietStart") void setPreference("quietHoursStart", value);
      else void setPreference("quietHoursEnd", value);
    },
    [setPreference],
  );

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

  const handleMoveTab = useCallback(
    (key: TabKey, direction: "up" | "down") => {
      void setPreference("tabOrder", moveTabOrder(tabOrder, key, direction));
    },
    [setPreference, tabOrder],
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
                  Control mobile assistance affordances.
                </Text>

                {/* TODO(wire-up): restore kairoTemperature control once the setting is live. */}
                {/* TODO(wire-up): restore kairoResponseStyle control once the setting is live. */}

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
                {/* TODO(wire-up): restore kairoUndoWindowMinutes control once the setting is live. */}
              </View>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>CLI Credentials</Text>
                    <Text style={styles.settingHelp}>
                      Issue a short-lived bootstrap token for `pravah auth import`.
                    </Text>
                    <Text style={styles.settingMeta}>
                      {automationCredentials.length} recorded
                    </Text>
                  </View>
                </View>

                <View style={styles.fieldStack}>
                  <Text style={styles.fieldLabel}>Credential label</Text>
                  <TextInput
                    value={automationLabel}
                    onChangeText={setAutomationLabel}
                    placeholder="Codex local"
                    placeholderTextColor={colors.textDim}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.textInput}
                    accessibilityLabel="Automation credential label"
                  />
                </View>

                <View style={styles.behaviorRow}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingMeta}>Allow task writes</Text>
                    <Text style={styles.settingHelp}>
                      Off by default. Enable only when the CLI should add, move,
                      complete, reopen, or unschedule tasks.
                    </Text>
                  </View>
                  <Switch
                    value={allowTaskWrites}
                    onValueChange={setAllowTaskWrites}
                    trackColor={{ false: colors.border, true: colors.accentSoft }}
                    thumbColor={allowTaskWrites ? colors.accent : colors.textMuted}
                  />
                </View>

                <Text style={styles.settingMeta}>
                  Scopes · {[
                    ...READ_ONLY_AUTOMATION_SCOPES,
                    ...(allowTaskWrites ? (["tasks:write"] as const) : []),
                  ].join(" · ")}
                </Text>

                <Pressable
                  onPress={() => void handleIssueBootstrapToken()}
                  disabled={isIssuingBootstrapToken}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Issue bootstrap token"
                  style={({ pressed }) => [
                    styles.softButton,
                    pressed && { opacity: 0.6 },
                    isIssuingBootstrapToken && styles.softButtonDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.softButtonText,
                      isIssuingBootstrapToken && styles.inlineActionDisabled,
                    ]}
                  >
                    {isIssuingBootstrapToken ? "Issuing…" : "Issue bootstrap token"}
                  </Text>
                </Pressable>

                {issuedBootstrapToken ? (
                  <View style={styles.tokenBlock}>
                    <Text style={styles.fieldLabel}>Bootstrap token</Text>
                    <Text style={styles.settingHelp}>
                      Copied to clipboard. It expires at{" "}
                      {new Date(issuedBootstrapToken.expiresAt).toLocaleString()}.
                    </Text>
                    <View style={styles.copyRow}>
                      <View style={[styles.codePill, styles.copyRowPill]}>
                        <Text selectable style={styles.codePillText} numberOfLines={1}>
                          {issuedBootstrapToken.token}
                        </Text>
                      </View>
                      <Pressable
                        onPress={() =>
                          void handleCopy(issuedBootstrapToken.token, "Bootstrap token")
                        }
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Copy bootstrap token"
                        style={({ pressed }) => [
                          styles.copyButton,
                          pressed && { opacity: 0.6 },
                        ]}
                      >
                        <Text style={styles.copyButtonText}>Copy</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}

                {automationCredentials.length === 0 ? (
                  <Text style={styles.settingMeta}>No automation credentials issued yet.</Text>
                ) : (
                  <View style={styles.credentialList}>
                    {automationCredentials.map((credential) => (
                      <View key={credential._id} style={styles.credentialRow}>
                        <View style={styles.settingCopy}>
                          <Text style={styles.settingLabel} numberOfLines={1}>
                            {credential.label}
                          </Text>
                          <Text style={styles.settingMeta}>
                            {credential.credentialPreview} · {credential.status}
                          </Text>
                          <Text style={styles.settingMeta} numberOfLines={1}>
                            {credential.scopes.join(" · ")}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => void handleRevokeCredential(credential._id)}
                          disabled={
                            credential.status === "revoked" ||
                            revokingCredentialId === credential._id
                          }
                          hitSlop={12}
                          accessibilityRole="button"
                          accessibilityLabel={`Revoke ${credential.label}`}
                          style={({ pressed }) => [
                            styles.copyChip,
                            pressed && { opacity: 0.6 },
                            (credential.status === "revoked" ||
                              revokingCredentialId === credential._id) &&
                              styles.softButtonDisabled,
                          ]}
                        >
                          <Text style={styles.copyChipText}>
                            {credential.status === "revoked"
                              ? "Revoked"
                              : revokingCredentialId === credential._id
                                ? "Revoking…"
                                : "Revoke"}
                          </Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )}
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
                    <Text style={[styles.settingStatus, { color: syncHealthColor(calendarSyncHealth) }]}>
                      {syncHealthLabel(calendarSyncHealth)}
                    </Text>
                    {calendarSyncHealth === "error" && calendarErrorSummary ? (
                      <Text style={[styles.settingMeta, { color: colors.error }]}>
                        {calendarErrorSummary}
                      </Text>
                    ) : null}
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
                  onPress={
                    calendarSyncHealth === "healthy" ? onGoogleCalendarSync : onEnableAndSyncGoogleCalendar
                  }
                  disabled={syncSettingsBusy}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel={`${calendarActionLabel(calendarSyncHealth, isCalendarSyncing)} Google Calendar`}
                  style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                >
                  <Text style={[styles.inlineActionText, syncSettingsBusy && styles.inlineActionDisabled]}>
                    {calendarActionLabel(calendarSyncHealth, isCalendarSyncing)}
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
                {pendingGmailReviewCount > 0 ? (
                  <Text style={styles.settingMeta}>
                    {pendingGmailReviewCount} captured{" "}
                    {pendingGmailReviewCount === 1 ? "item" : "items"} waiting for review
                  </Text>
                ) : null}
                {!canToggleGmailSync ? (
                  <Text style={styles.settingMeta}>Connect Gmail on web before enabling mobile sync.</Text>
                ) : null}
                <GmailReviewSection enabled={gmailSyncEnabled} showToast={showToast} />
              </View>
            </View>
          ) : null}

          {activeSection === "alerts" ? (
            <View>
              <Text style={styles.sectionHeader}>Reminders</Text>

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <Text style={styles.settingLabel}>Notifications</Text>
                <Text style={styles.settingHelp}>
                  Timed Tasks notify at their Deadline and date-only Tasks roll into one morning digest.
                </Text>
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

                <View style={styles.behaviorRow}>
                  <Text style={styles.settingMeta}>Morning digest time</Text>
                  <Pressable
                    onPress={() => setOpenPicker("morningDigest")}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={`Change morning digest time, currently ${formatClockLabel(prefs.morningDigestTime)}`}
                    style={({ pressed }) => [styles.timeInlineButton, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.timeInlineButtonText}>
                      {formatClockLabel(prefs.morningDigestTime)}
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.behaviorRow}>
                  <Text style={styles.settingMeta}>Heads-up lead time</Text>
                  <View style={styles.chipRow}>
                    {REMINDER_LEAD_TIME_OPTIONS.map((minutes) => {
                      const active = prefs.reminderLeadTimeMinutes === minutes;
                      return (
                        <Pressable
                          key={minutes}
                          onPress={() => void setPreference("reminderLeadTimeMinutes", minutes)}
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

              <View style={[styles.settingBlock, styles.sectionCard]}>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>Quiet hours</Text>
                    <Text style={styles.settingHelp}>
                      A window where auto-chosen notification times are adjusted to
                      fire outside this range. Explicit timed Task Reminders still fire.
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
                <SnapWheelTimePicker
                  visible
                  title={pickerTitle(openPicker)}
                  value={pickerValue(openPicker, prefs)}
                  onConfirm={(value) => handleTimePicked(openPicker, value)}
                  onClose={() => setOpenPicker(null)}
                />
              ) : null}
            </View>
          ) : null}

          {activeSection === "timeline" ? (
            <View>
              <Text style={styles.sectionHeader}>Timeline</Text>
              <View style={[styles.settingBlock, styles.sectionCard]}>
                <View style={styles.settingRow}>
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingLabel}>Bulk task capture</Text>
                    <Text style={styles.settingHelp}>
                      Create numbered task series and assign copies to multiple goals.
                    </Text>
                  </View>
                  <Switch
                    value={prefs.bulkTaskCaptureEnabled}
                    onValueChange={(next) => void setPreference("bulkTaskCaptureEnabled", next)}
                    trackColor={{ false: colors.border, true: colors.accentSoft }}
                    thumbColor={prefs.bulkTaskCaptureEnabled ? colors.accent : colors.textMuted}
                    accessibilityLabel="Bulk task capture"
                  />
                </View>
              </View>

              {/* TODO(wire-up): restore defaultTaskDurationMin control once the setting is live. */}
              {/* TODO(wire-up): restore taskColorScheme control once the setting is live. */}

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
                <Text style={styles.settingLabel}>Tab order</Text>
                <Text style={styles.settingHelp}>
                  Reorder Inbox, Timeline, Goals, and Progress. Capture stays fixed in the center.
                </Text>
                <TabOrderPreview order={tabOrder} />
                <TabOrderEditor order={tabOrder} onMove={handleMoveTab} />
              </View>

              {/* TODO(wire-up): restore accentColor control once the setting is live. */}
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
                        {summarizeSyncError(calendarLastError)}
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
                        {summarizeSyncError(gmailLastError)}
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
  textInput: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    backgroundColor: colors.bgInput,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
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
  tabOrderPreview: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.bgCard,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: spacing.xs,
  },
  tabPreviewItem: {
    flex: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.bgInput,
  },
  tabPreviewText: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  tabPreviewCapture: {
    flex: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderFocus,
  },
  tabPreviewCaptureText: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: "600",
  },
  tabOrderEditor: {
    gap: spacing.xs,
  },
  tabOrderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  tabOrderIndex: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  tabOrderIndexText: {
    ...typography.micro,
    color: colors.textMuted,
    fontWeight: "600",
  },
  tabOrderControls: {
    flexDirection: "row",
    gap: spacing.xs,
  },
  tabOrderButton: {
    width: 34,
    height: 34,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  tabOrderButtonDisabled: {
    opacity: 0.35,
  },
  tabOrderButtonText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontWeight: "700",
  },
  tabOrderButtonTextDisabled: {
    color: colors.textMuted,
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
  timeInlineButton: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  timeInlineButtonText: {
    ...typography.micro,
    color: colors.accent,
    fontWeight: "600",
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
    // Errors are human content, not chrome: keep them mixed-case and readable
    // rather than the uppercase log-line treatment used elsewhere.
    textTransform: "none",
    color: colors.textSecondary,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
    lineHeight: 16,
  },
  tokenBlock: {
    backgroundColor: colors.accentDim,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderFocus,
    padding: spacing.sm,
    gap: spacing.xs,
  },
  credentialList: {
    gap: spacing.xs,
  },
  credentialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
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
