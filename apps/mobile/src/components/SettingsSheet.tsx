import { useCallback, useEffect, useReducer, useState, type JSX } from "react";
import {
  Keyboard,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { useMutation, useQuery } from "convex/react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import appJson from "../../app.json";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { getKairoSettings } from "../lib/kairoConfig";
import type { NotificationPermissionState } from "../lib/notifications";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { useUserPreferences } from "../hooks/useUserPreferences";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { getOrCreateDeviceId } from "../lib/deviceIdentity";
import { retryQueueStorage } from "../lib/retry-queue-storage";
import { classifyError, mobileLogger } from "../lib/logger";
import { ArrowUpRightIcon, ChevronLeftIcon, ChevronRightIcon } from "./UiIcons";
import AboutIconAsset from "../assets/icons/settings-about.svg";
import AppearanceIconAsset from "../assets/icons/settings-appearance.svg";
import InteractionIconAsset from "../assets/icons/settings-interaction.svg";
import KairoIconAsset from "../assets/icons/settings-kairo.svg";
import RemindersIconAsset from "../assets/icons/settings-reminders.svg";
import SyncIconAsset from "../assets/icons/settings-sync.svg";
import {
  moveTabOrder,
  resolveTabOrder,
  TAB_LABELS,
  type TabKey,
} from "../lib/tabOrder";
import {
  INITIAL_SETTINGS_NAVIGATION,
  SETTINGS_CATEGORY_META,
  SETTINGS_CATEGORY_ORDER,
  settingsNavigationReducer,
  type SettingsCategoryKey,
  type SettingsNavigationState,
} from "../lib/settingsNavigation";
import type { AccentColor, Density } from "../lib/userPreferences";
import { KairoSettingsSection } from "./KairoSettingsSection";
import { GmailReviewSection } from "./GmailReviewSection";
import { AppUpdateSection } from "./AppUpdateSection";
import { SnapWheelTimePicker } from "./SnapWheelTimePicker";
import {
  summarizeSyncError,
  type GoogleCalendarOption,
  type IntegrationLastRunSummary,
  type SyncHealth,
} from "../hooks/useIntegrationsSettings";

type QuietPickerKind = "morningDigest" | "quietStart" | "quietEnd";

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

const REMINDER_LEAD_TIME_OPTIONS = [5, 15, 30, 60] as const;
const DENSITY_OPTIONS: Array<{ value: Density; label: string; description: string }> = [
  {
    value: "cozy",
    label: "Comfortable",
    description: "The default thumb-safe spacing used across the redesign.",
  },
  {
    value: "compact",
    label: "Compact",
    description: "Tighter task rows for review-heavy sessions.",
  },
];
const TASK_COLOR_OPTIONS: Array<{
  value: AccentColor;
  label: string;
  description: string;
  swatch: string;
}> = [
  {
    value: "purple",
    label: "Indigo",
    description: "Default Pravah selection and planning accent.",
    swatch: colors.accent,
  },
  {
    value: "copper",
    label: "Copper",
    description: "Warmer task emphasis for deadline-heavy planning.",
    swatch: colors.deadline,
  },
  {
    value: "teal",
    label: "Teal",
    description: "Cooler task emphasis for quieter review sessions.",
    swatch: "#3e7b78",
  },
  {
    value: "rose",
    label: "Rose",
    description: "Sharper task emphasis for high-attention queues.",
    swatch: "#9d586f",
  },
];
const READ_ONLY_AUTOMATION_SCOPES = ["tasks:read", "review:read", "sync:read"] as const;
const APP_VERSION = appJson.expo?.version ?? "—";
const REPO_URL = "https://github.com/Snehit70/pravah";
const CHANGELOG_URL = `${REPO_URL}/blob/main/apps/mobile/CHANGELOG.md`;
const ISSUES_URL = `${REPO_URL}/issues`;

type CategoryIconProps = {
  color: string;
  size?: number;
};

type SettingsHomeStatusTone = "success" | "warning" | "error" | "neutral";

type SettingsHomeStatus = {
  label: string;
  tone: SettingsHomeStatusTone;
};

function SyncIcon({ color: _color, size = 18 }: CategoryIconProps) {
  return <SyncIconAsset width={size} height={size} />;
}

function KairoIcon({ color, size = 18 }: CategoryIconProps) {
  return <KairoIconAsset width={size} height={size} color={color} />;
}

function CliIcon({ color, size = 18 }: CategoryIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 7L10 12L5 17"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12.5 17H19"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function BellIcon({ color: _color, size = 18 }: CategoryIconProps) {
  return <RemindersIconAsset width={size} height={size} />;
}

function HandIcon({ color: _color, size = 18 }: CategoryIconProps) {
  return <InteractionIconAsset width={size} height={size} />;
}

function SlidersIcon({ color: _color, size = 18 }: CategoryIconProps) {
  return <AppearanceIconAsset width={size} height={size} />;
}

function InfoIcon({ color: _color, size = 18 }: CategoryIconProps) {
  return <AboutIconAsset width={size} height={size} />;
}

const SETTINGS_CATEGORY_ICONS: Partial<
  Record<SettingsCategoryKey, (props: CategoryIconProps) => JSX.Element>
> = {
  kairo: KairoIcon,
  cli: CliIcon,
  sync: SyncIcon,
  reminders: BellIcon,
  interaction: HandIcon,
  appearance: SlidersIcon,
  about: InfoIcon,
};

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
  if (run.status === "failed") return when ? `Last sync failed, ${when}` : "Last sync failed";
  if (!when) return null;
  const counts =
    (run.importedCount ?? 0) + (run.updatedCount ?? 0) > 0
      ? `, ${(run.importedCount ?? 0) + (run.updatedCount ?? 0)} items`
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

function pickerValue(
  kind: QuietPickerKind,
  prefs: { morningDigestTime: string; quietHoursStart: string; quietHoursEnd: string },
): string {
  if (kind === "morningDigest") return prefs.morningDigestTime;
  if (kind === "quietStart") return prefs.quietHoursStart;
  return prefs.quietHoursEnd;
}

function calendarActionLabel(health: SyncHealth, isSyncing: boolean): string {
  if (isSyncing) return "Syncing…";
  if (health === "error") return "Reconnect";
  if (health === "paused" || health === "disconnected") return "Enable and sync";
  return "Sync now";
}

function settingsStatusColor(tone: SettingsHomeStatusTone): string {
  if (tone === "success") return colors.success;
  if (tone === "warning") return colors.warning;
  if (tone === "error") return colors.error;
  return colors.textSecondary;
}

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

function SettingsCategoryList({
  onOpenCategory,
  statuses,
}: {
  onOpenCategory: (category: SettingsCategoryKey) => void;
  statuses: Record<SettingsCategoryKey, SettingsHomeStatus>;
}) {
  return (
    <View style={styles.screenBody}>
      <View style={styles.categoryPanel}>
        {SETTINGS_CATEGORY_ORDER.map((category) => {
          const meta = SETTINGS_CATEGORY_META[category];
          const Icon = SETTINGS_CATEGORY_ICONS[category];
          const status = statuses[category];
          const isLast = category === SETTINGS_CATEGORY_ORDER[SETTINGS_CATEGORY_ORDER.length - 1];
          return (
            <View key={category}>
              <Pressable
                onPress={() => onOpenCategory(category)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Open ${meta.title} settings`}
                style={({ pressed }) => [
                  styles.categoryCard,
                  pressed && { opacity: 0.72 },
                ]}
              >
                {Icon ? (
                  <View style={styles.categoryIconWrap}>
                    <Icon color={colors.textSecondary} size={18} />
                  </View>
                ) : null}
                <View style={styles.categoryCopy}>
                  <Text style={styles.categoryTitle}>{meta.title}</Text>
                  <Text style={styles.categorySummary}>{meta.summary}</Text>
                </View>
                <View style={styles.categoryMeta}>
                  <Text
                    style={[
                      styles.categoryStatus,
                      { color: settingsStatusColor(status.tone) },
                    ]}
                  >
                    {status.label}
                  </Text>
                  <ChevronRightIcon color={colors.textDim} size={16} />
                </View>
              </Pressable>
              {!isLast ? <View style={styles.categoryDivider} /> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

type KairoSectionProps = {
  prefs: ReturnType<typeof useUserPreferences>["prefs"];
  setPreference: ReturnType<typeof useUserPreferences>["setPreference"];
};

function KairoSection(_: KairoSectionProps) {
  return (
    <View style={styles.screenBody}>
      <View style={[styles.settingBlock, styles.sectionCard]}>
        <KairoSettingsSection />
      </View>
    </View>
  );
}

type CliCredentialsSectionProps = {
  automationCredentials: Array<{
    _id: Id<"automationCredentials">;
    label: string;
    credentialPreview: string;
    status: string;
    scopes: string[];
  }>;
  automationLabel: string;
  setAutomationLabel: (value: string) => void;
  allowTaskWrites: boolean;
  setAllowTaskWrites: (value: boolean) => void;
  issuedBootstrapToken: { token: string; expiresAt: number } | null;
  isIssuingBootstrapToken: boolean;
  onIssueBootstrapToken: () => void;
  onCopy: (value: string, label: string) => Promise<void>;
  onRevokeCredential: (credentialId: Id<"automationCredentials">) => Promise<void>;
  revokingCredentialId: Id<"automationCredentials"> | null;
};

function CliCredentialsSection({
  automationCredentials,
  automationLabel,
  setAutomationLabel,
  allowTaskWrites,
  setAllowTaskWrites,
  issuedBootstrapToken,
  isIssuingBootstrapToken,
  onIssueBootstrapToken,
  onCopy,
  onRevokeCredential,
  revokingCredentialId,
}: CliCredentialsSectionProps) {
  return (
    <View style={styles.screenBody}>
      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>CLI credentials</Text>
        <Text style={styles.settingHelp}>
          Issue a short-lived bootstrap token for `pravah setup` or `pravah auth import`.
        </Text>
        <Text style={styles.settingMeta}>{automationCredentials.length} recorded</Text>

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
              Off by default. Enable only when the CLI should change tasks from this device.
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
          onPress={onIssueBootstrapToken}
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
                onPress={() => void onCopy(issuedBootstrapToken.token, "Bootstrap token")}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel="Copy bootstrap token"
                style={({ pressed }) => [styles.copyButton, pressed && { opacity: 0.6 }]}
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
                  onPress={() => void onRevokeCredential(credential._id)}
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
  );
}

type SyncSectionProps = {
  calendarSyncEnabled: boolean;
  calendarSyncHealth: SyncHealth;
  calendarErrorSummary?: string;
  calendarAccountEmail?: string;
  calendarLastRun?: IntegrationLastRunSummary;
  isGoogleToggleSaving: boolean;
  availableCalendars: GoogleCalendarOption[];
  selectedCalendarIds: string[];
  isLoadingCalendars: boolean;
  onToggleCalendarSelected: (id: string) => void;
  syncSettingsBusy: boolean;
  isCalendarSyncing: boolean;
  onGoogleCalendarToggle: () => void;
  onGoogleCalendarSync: () => void;
  onEnableAndSyncGoogleCalendar: () => void;
  gmailSyncEnabled: boolean;
  gmailSyncStatus: string;
  gmailAccountEmail?: string;
  gmailLastRun?: IntegrationLastRunSummary;
  pendingGmailReviewCount: number;
  isGmailToggleSaving: boolean;
  canToggleGmailSync: boolean;
  onGmailToggle: () => void;
  showToast: SettingsSheetProps["showToast"];
};

function SyncSection({
  calendarSyncEnabled,
  calendarSyncHealth,
  calendarErrorSummary,
  calendarAccountEmail,
  calendarLastRun,
  isGoogleToggleSaving,
  availableCalendars,
  selectedCalendarIds,
  isLoadingCalendars,
  onToggleCalendarSelected,
  syncSettingsBusy,
  isCalendarSyncing,
  onGoogleCalendarToggle,
  onGoogleCalendarSync,
  onEnableAndSyncGoogleCalendar,
  gmailSyncEnabled,
  gmailSyncStatus,
  gmailAccountEmail,
  gmailLastRun,
  pendingGmailReviewCount,
  isGmailToggleSaving,
  canToggleGmailSync,
  onGmailToggle,
  showToast,
}: SyncSectionProps) {
  return (
    <View style={styles.screenBody}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryKicker}>Calendar</Text>
          <Text style={styles.summaryValue}>{syncHealthLabel(calendarSyncHealth)}</Text>
          <Text style={styles.summaryMeta}>
            {calendarSyncEnabled ? "Timeline import on" : "Timeline import off"}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryKicker}>Gmail</Text>
          <Text style={styles.summaryValue}>{formatStatusLabel(gmailSyncStatus)}</Text>
          <Text style={styles.summaryMeta}>
            {gmailSyncEnabled ? "Review capture on" : "Review capture off"}
          </Text>
        </View>
      </View>

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
              {isLoadingCalendars ? <Text style={styles.settingMeta}>Loading…</Text> : null}
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
                  <View
                    style={[
                      styles.calendarCheckbox,
                      checked && styles.calendarCheckboxChecked,
                    ]}
                  >
                    {checked ? <Text style={styles.calendarCheckmark}>✓</Text> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.settingLabel} numberOfLines={1}>
                      {calendar.summary}
                    </Text>
                    {calendar.primary ? <Text style={styles.settingMeta}>Primary</Text> : null}
                  </View>
                </Pressable>
              );
            })}
            {availableCalendars.length > 0 && selectedCalendarIds.length === 0 ? (
              <Text style={styles.settingMeta}>
                No calendars selected, sync will pull all of them.
              </Text>
            ) : null}
          </View>
        ) : null}
        <Pressable
          onPress={
            calendarSyncHealth === "healthy"
              ? onGoogleCalendarSync
              : onEnableAndSyncGoogleCalendar
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
          <Text style={styles.settingMeta}>
            Connect Gmail on web before enabling mobile sync.
          </Text>
        ) : null}
        <GmailReviewSection enabled={gmailSyncEnabled} showToast={showToast} />
      </View>
    </View>
  );
}

type RemindersSectionProps = {
  prefs: ReturnType<typeof useUserPreferences>["prefs"];
  setPreference: ReturnType<typeof useUserPreferences>["setPreference"];
  notificationPermissionState: NotificationPermissionState;
  notificationsEnabled: boolean;
  isNotificationsBusy: boolean;
  onRequestNotificationsAccess: () => void;
  onSendTestNotification: () => void;
  openPicker: QuietPickerKind | null;
  onOpenPicker: (kind: QuietPickerKind) => void;
  onTimePicked: (kind: QuietPickerKind, value: string) => void;
  onClosePicker: () => void;
};

function RemindersSection({
  prefs,
  setPreference,
  notificationPermissionState,
  notificationsEnabled,
  isNotificationsBusy,
  onRequestNotificationsAccess,
  onSendTestNotification,
  openPicker,
  onOpenPicker,
  onTimePicked,
  onClosePicker,
}: RemindersSectionProps) {
  return (
    <View style={styles.screenBody}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryKicker}>Notifications</Text>
          <Text style={styles.summaryValue}>{formatStatusLabel(notificationPermissionState)}</Text>
          <Text style={styles.summaryMeta}>
            {notificationsEnabled ? "Alerts available on this device" : "Permission still needed"}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryKicker}>Morning digest</Text>
          <Text style={styles.summaryValue}>{formatClockLabel(prefs.morningDigestTime)}</Text>
          <Text style={styles.summaryMeta}>
            {prefs.quietHoursEnabled ? "Quiet hours adjust delivery" : "No quiet hours set"}
          </Text>
        </View>
      </View>

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Notifications</Text>
        <Text style={styles.settingHelp}>
          Timed tasks notify at their deadline, and date-only tasks roll into one morning digest.
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
            onPress={() => onOpenPicker("morningDigest")}
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
              A window where auto-chosen notification times are adjusted to fire outside this range.
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
          onPress={() => onOpenPicker("quietStart")}
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
          onPress={() => onOpenPicker("quietEnd")}
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
          onConfirm={(value) => onTimePicked(openPicker, value)}
          onClose={onClosePicker}
        />
      ) : null}
    </View>
  );
}

type AppearanceSectionProps = {
  prefs: ReturnType<typeof useUserPreferences>["prefs"];
  setPreference: ReturnType<typeof useUserPreferences>["setPreference"];
  tabOrder: readonly TabKey[];
  onMoveTab: (key: TabKey, direction: "up" | "down") => void;
};

type InteractionSectionProps = {
  prefs: ReturnType<typeof useUserPreferences>["prefs"];
  setPreference: ReturnType<typeof useUserPreferences>["setPreference"];
};

function InteractionSection({ prefs, setPreference }: InteractionSectionProps) {
  return (
    <View style={styles.screenBody}>
      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Quick capture</Text>
        <Text style={styles.settingHelp}>
          Capture stays centered in the tab bar. Advanced creation tools stay hidden until
          you choose to use them.
        </Text>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingMeta}>Bulk task capture</Text>
            <Text style={styles.settingHelp}>
              Create numbered task series and assign copies to multiple Goals.
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

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Task gestures</Text>
        <Text style={styles.settingHelp}>
          Keep visible actions available on every Task. Swipe actions are optional accelerators.
        </Text>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingMeta}>Swipe actions</Text>
            <Text style={styles.settingHelp}>
              Off by default to reduce accidental completion or rescheduling.
            </Text>
          </View>
          <Switch
            value={prefs.swipeActionsEnabled}
            onValueChange={(next) => void setPreference("swipeActionsEnabled", next)}
            trackColor={{ false: colors.border, true: colors.accentSoft }}
            thumbColor={prefs.swipeActionsEnabled ? colors.accent : colors.textMuted}
            accessibilityLabel="Swipe actions"
          />
        </View>
      </View>

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Feedback</Text>
        <Text style={styles.settingHelp}>
          Sensory feedback is subtle and functional. Sound stays off unless you enable it.
        </Text>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingMeta}>Haptics</Text>
            <Text style={styles.settingHelp}>
              Light feedback for capture, completion, selection, and confirmed Kairo actions.
            </Text>
          </View>
          <Switch
            value={prefs.hapticsEnabled}
            onValueChange={(next) => void setPreference("hapticsEnabled", next)}
            trackColor={{ false: colors.border, true: colors.accentSoft }}
            thumbColor={prefs.hapticsEnabled ? colors.accent : colors.textMuted}
            accessibilityLabel="Haptics"
          />
        </View>
        <View style={styles.settingRow}>
          <View style={styles.settingCopy}>
            <Text style={styles.settingMeta}>Sound</Text>
            <Text style={styles.settingHelp}>
              Optional quiet cues for capture, completion, and critical attention states.
            </Text>
          </View>
          <Switch
            value={prefs.soundEnabled}
            onValueChange={(next) => void setPreference("soundEnabled", next)}
            trackColor={{ false: colors.border, true: colors.accentSoft }}
            thumbColor={prefs.soundEnabled ? colors.accent : colors.textMuted}
            accessibilityLabel="Sound"
          />
        </View>
      </View>

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Motion</Text>
        <Text style={styles.settingHelp}>
          Motion clarifies state changes. It should never slow down capture or completion.
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
      </View>
    </View>
  );
}

function AppearanceSection({
  prefs,
  setPreference,
  tabOrder,
  onMoveTab,
}: AppearanceSectionProps) {
  return (
    <View style={styles.screenBody}>
      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Theme</Text>
        <Text style={styles.settingHelp}>
          Warm light surfaces are the production theme. Dark or alternate themes stay out
          until the full token set exists.
        </Text>
        <View style={styles.selectionCardSelected}>
          <View style={styles.selectionCopy}>
            <Text style={styles.selectionTitle}>Warm light</Text>
            <Text style={styles.selectionDescription}>
              Paper neutrals, warm ink, and restrained indigo accent.
            </Text>
          </View>
          <Text style={styles.selectionStatusText}>Active</Text>
        </View>
      </View>

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Typography</Text>
        <Text style={styles.settingHelp}>
          Geist is the only shipped font system. More fonts need full truncation,
          line-height, and accessibility validation before they become settings.
        </Text>
        <View style={styles.selectionCardSelected}>
          <View style={styles.selectionCopy}>
            <Text style={styles.selectionTitle}>Geist</Text>
            <Text style={styles.selectionDescription}>
              Sans for product UI, Geist Mono for dates, counts, and compact metadata.
            </Text>
          </View>
          <Text style={styles.selectionStatusText}>Active</Text>
        </View>
      </View>

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Density</Text>
        <Text style={styles.settingHelp}>
          Comfortable is the default. Compact tightens task rows without hiding actions.
        </Text>
        <View style={styles.optionGrid}>
          {DENSITY_OPTIONS.map((option) => {
            const active = prefs.density === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => void setPreference("density", option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Use ${option.label} density`}
                style={({ pressed }) => [
                  styles.optionCard,
                  active && styles.optionCardActive,
                  pressed && { opacity: 0.72 },
                ]}
              >
                <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                  {option.label}
                </Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Task color</Text>
        <Text style={styles.settingHelp}>
          Choose the task emphasis color used by task rows. Status colors keep their
          fixed meanings.
        </Text>
        <View style={styles.swatchGrid}>
          {TASK_COLOR_OPTIONS.map((option) => {
            const active = prefs.taskColorScheme === option.value;
            return (
              <Pressable
                key={option.value}
                onPress={() => void setPreference("taskColorScheme", option.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Use ${option.label} task color`}
                style={({ pressed }) => [
                  styles.swatchOption,
                  active && styles.optionCardActive,
                  pressed && { opacity: 0.72 },
                ]}
              >
                <View style={[styles.swatchDot, { backgroundColor: option.swatch }]} />
                <View style={styles.selectionCopy}>
                  <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>
                    {option.label}
                  </Text>
                  <Text style={styles.optionDescription}>{option.description}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Tab order</Text>
        <Text style={styles.settingHelp}>
          Reorder Inbox, Timeline, Goals, and Progress. Capture stays fixed in the center.
        </Text>
        <TabOrderPreview order={tabOrder} />
        <TabOrderEditor order={tabOrder} onMove={onMoveTab} />
      </View>
    </View>
  );
}

type AboutSectionProps = {
  deviceId: string | null;
  onCopy: (value: string, label: string) => Promise<void>;
  onExportDiagnostics: () => void;
  calendarLastError?: string;
  gmailLastError?: string;
  isClearingRetryQueue: boolean;
  onClearRetryQueue: () => void;
  onExportTasks: () => void;
  onSignOut: () => void;
  dangerArmed: "wipe" | null;
  isWiping: boolean;
  onWipeLocalData: () => void;
};

function AboutSection({
  deviceId,
  onCopy,
  onExportDiagnostics,
  calendarLastError,
  gmailLastError,
  isClearingRetryQueue,
  onClearRetryQueue,
  onExportTasks,
  onSignOut,
  dangerArmed,
  isWiping,
  onWipeLocalData,
}: AboutSectionProps) {
  return (
    <View style={styles.screenBody}>
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
          <ArrowUpRightIcon color={colors.textMuted} size={16} />
        </Pressable>
        <Pressable
          onPress={() => void Linking.openURL(REPO_URL)}
          hitSlop={12}
          accessibilityRole="link"
          accessibilityLabel="Open Pravah repository on GitHub"
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.linkRowText}>GitHub repository</Text>
          <ArrowUpRightIcon color={colors.textMuted} size={16} />
        </Pressable>
      </View>

      <AppUpdateSection />

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Diagnostics</Text>
        <Text style={styles.settingHelp}>
          Export recent app events, device metadata, and sync state as a JSON file.
        </Text>
        <View style={styles.copyRow}>
          <View style={[styles.codePill, styles.copyRowPill]}>
            <Text selectable style={styles.codePillText} numberOfLines={1}>
              {deviceId ?? "Loading…"}
            </Text>
          </View>
          <Pressable
            onPress={() => deviceId && void onCopy(deviceId, "Device ID")}
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
            <Text style={styles.copyButtonText}>Copy ID</Text>
          </Pressable>
        </View>
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
          Review the latest Google Calendar and Gmail failures without leaving the app.
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
                onPress={() => void onCopy(calendarLastError, "Calendar error")}
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
                onPress={() => void onCopy(gmailLastError, "Gmail error")}
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
        <Text style={styles.settingLabel}>Your data</Text>
        <Text style={styles.settingHelp}>
          Export every task currently in view as JSON via the system share sheet.
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

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <Text style={styles.settingLabel}>Retry queue</Text>
        <Text style={styles.settingHelp}>
          Drop pending offline retries if a stuck request is blocking fresh syncs.
        </Text>
        <Pressable
          onPress={onClearRetryQueue}
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

      <View style={[styles.settingBlock, styles.sectionCard, styles.accountCard]}>
        <Text style={styles.settingLabel}>Account</Text>
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
          Wipe locally cached preferences, retry queue, snapshot, and reminder schedule. Server data is untouched.
        </Text>
        <Pressable
          onPress={onWipeLocalData}
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
          To permanently delete your Pravah account and server data, open a request with support.
        </Text>
        <Pressable
          onPress={() =>
            void Linking.openURL(`${ISSUES_URL}/new?title=Delete+my+Pravah+account`)
          }
          hitSlop={12}
          accessibilityRole="link"
          accessibilityLabel="Request account deletion via GitHub issue"
          style={({ pressed }) => [styles.sectionFootAction, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.dangerActionText}>Request account deletion →</Text>
        </Pressable>
      </View>
    </View>
  );
}

function renderDetailScreen(
  navigation: SettingsNavigationState,
  props: {
    prefs: ReturnType<typeof useUserPreferences>["prefs"];
    setPreference: ReturnType<typeof useUserPreferences>["setPreference"];
    automationCredentials: Array<{
      _id: Id<"automationCredentials">;
      label: string;
      credentialPreview: string;
      status: string;
      scopes: string[];
    }>;
    automationLabel: string;
    setAutomationLabel: (value: string) => void;
    allowTaskWrites: boolean;
    setAllowTaskWrites: (value: boolean) => void;
    issuedBootstrapToken: { token: string; expiresAt: number } | null;
    isIssuingBootstrapToken: boolean;
    onIssueBootstrapToken: () => void;
    onCopy: (value: string, label: string) => Promise<void>;
    onRevokeCredential: (credentialId: Id<"automationCredentials">) => Promise<void>;
    revokingCredentialId: Id<"automationCredentials"> | null;
    calendarSyncEnabled: boolean;
    calendarSyncHealth: SyncHealth;
    calendarErrorSummary?: string;
    calendarAccountEmail?: string;
    calendarLastRun?: IntegrationLastRunSummary;
    isGoogleToggleSaving: boolean;
    availableCalendars: GoogleCalendarOption[];
    selectedCalendarIds: string[];
    isLoadingCalendars: boolean;
    onToggleCalendarSelected: (id: string) => void;
    syncSettingsBusy: boolean;
    isCalendarSyncing: boolean;
    onGoogleCalendarToggle: () => void;
    onGoogleCalendarSync: () => void;
    onEnableAndSyncGoogleCalendar: () => void;
    gmailSyncEnabled: boolean;
    gmailSyncStatus: string;
    gmailAccountEmail?: string;
    gmailLastRun?: IntegrationLastRunSummary;
    pendingGmailReviewCount: number;
    isGmailToggleSaving: boolean;
    canToggleGmailSync: boolean;
    onGmailToggle: () => void;
    showToast: SettingsSheetProps["showToast"];
    notificationPermissionState: NotificationPermissionState;
    notificationsEnabled: boolean;
    isNotificationsBusy: boolean;
    onRequestNotificationsAccess: () => void;
    onSendTestNotification: () => void;
    openPicker: QuietPickerKind | null;
    onOpenPicker: (kind: QuietPickerKind) => void;
    onTimePicked: (kind: QuietPickerKind, value: string) => void;
    onClosePicker: () => void;
    tabOrder: readonly TabKey[];
    onMoveTab: (key: TabKey, direction: "up" | "down") => void;
    deviceId: string | null;
    onExportDiagnostics: () => void;
    calendarLastError?: string;
    gmailLastError?: string;
    isClearingRetryQueue: boolean;
    onClearRetryQueue: () => void;
    onExportTasks: () => void;
    onSignOut: () => void;
    dangerArmed: "wipe" | null;
    isWiping: boolean;
    onWipeLocalData: () => void;
  },
) {
  if (navigation.screen !== "detail") return null;

  switch (navigation.category) {
    case "kairo":
      return <KairoSection prefs={props.prefs} setPreference={props.setPreference} />;
    case "cli":
      return (
        <CliCredentialsSection
          automationCredentials={props.automationCredentials}
          automationLabel={props.automationLabel}
          setAutomationLabel={props.setAutomationLabel}
          allowTaskWrites={props.allowTaskWrites}
          setAllowTaskWrites={props.setAllowTaskWrites}
          issuedBootstrapToken={props.issuedBootstrapToken}
          isIssuingBootstrapToken={props.isIssuingBootstrapToken}
          onIssueBootstrapToken={props.onIssueBootstrapToken}
          onCopy={props.onCopy}
          onRevokeCredential={props.onRevokeCredential}
          revokingCredentialId={props.revokingCredentialId}
        />
      );
    case "sync":
      return <SyncSection {...props} />;
    case "reminders":
      return <RemindersSection {...props} />;
    case "interaction":
      return <InteractionSection {...props} />;
    case "appearance":
      return <AppearanceSection {...props} />;
    case "about":
      return <AboutSection {...props} />;
  }
}

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
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [navigation, dispatchNavigation] = useReducer(
    settingsNavigationReducer,
    INITIAL_SETTINGS_NAVIGATION,
  );
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
  const [kairoHomeStatus, setKairoHomeStatus] = useState<SettingsHomeStatus>({
    label: "Checking",
    tone: "neutral",
  });
  const issueBootstrapToken = useMutation(api.automation.issueBootstrapToken);
  const revokeCredential = useMutation(api.automation.revokeCredential);
  const automationCredentials = useQuery(api.automation.listCredentials, {}) ?? [];

  useEffect(() => {
    if (!dangerArmed) return;
    const timeout = setTimeout(() => setDangerArmed(null), 5000);
    return () => clearTimeout(timeout);
  }, [dangerArmed]);

  useEffect(() => {
    if (!visible) {
      setOpenPicker(null);
      setDangerArmed(null);
      dispatchNavigation({ type: "reset" });
      return;
    }
    dispatchNavigation({ type: "reset" });
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (navigation.screen !== "detail" || navigation.category !== "about" || deviceId) return;
    void getOrCreateDeviceId().then(setDeviceId);
  }, [deviceId, navigation, visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void getKairoSettings()
      .then((settings) => {
        if (cancelled) return;
        const profile = settings.profiles[settings.defaultProvider];
        setKairoHomeStatus(
          profile.apiKey
            ? { label: "Ready", tone: "success" }
            : { label: "Needs setup", tone: "warning" },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setKairoHomeStatus({ label: "Issue", tone: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleClose = useCallback(() => {
    Keyboard.dismiss();
    setOpenPicker(null);
    dispatchNavigation({ type: "reset" });
    onClose();
  }, [onClose]);

  const handleBack = useCallback(() => {
    if (navigation.screen === "detail") {
      Keyboard.dismiss();
      setOpenPicker(null);
      dispatchNavigation({ type: "back" });
      return;
    }
    handleClose();
  }, [handleClose, navigation.screen]);

  const handleOpenCategory = useCallback((category: SettingsCategoryKey) => {
    Keyboard.dismiss();
    dispatchNavigation({ type: "open", category });
  }, []);

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
    [showToast],
  );

  const handleClearRetryQueue = useCallback(async () => {
    if (isClearingRetryQueue) return;
    setIsClearingRetryQueue(true);
    try {
      await retryQueueStorage.removeItem("pravah_mobile_retry_queue_v1");
      await SecureStore.deleteItemAsync("pravah_mobile_retry_queue_v1").catch(() => undefined);
      showToast({ kind: "info", message: "Retry queue cleared." });
    } catch (error) {
      mobileLogger.warn("retry_queue_clear_failed", { errorType: classifyError(error) });
      showToast({ kind: "error", message: "Could not clear retry queue." });
    } finally {
      setIsClearingRetryQueue(false);
    }
  }, [isClearingRetryQueue, showToast]);

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
    [revokeCredential, showToast],
  );

  const handleTimePicked = useCallback(
    (kind: QuietPickerKind, value: string) => {
      if (kind === "morningDigest") void setPreference("morningDigestTime", value);
      else if (kind === "quietStart") void setPreference("quietHoursStart", value);
      else void setPreference("quietHoursEnd", value);
    },
    [setPreference],
  );

  const handleMoveTab = useCallback(
    (key: TabKey, direction: "up" | "down") => {
      void setPreference("tabOrder", moveTabOrder(tabOrder, key, direction));
    },
    [setPreference, tabOrder],
  );

  const headerTitle =
    navigation.screen === "detail"
      ? SETTINGS_CATEGORY_META[navigation.category].title
      : "Settings";
  const showKairoHeaderMark =
    navigation.screen === "detail" && navigation.category === "kairo";

  const settingsHomeStatuses: Record<SettingsCategoryKey, SettingsHomeStatus> = {
    kairo: kairoHomeStatus,
    cli:
      automationCredentials.length > 0
        ? { label: `${automationCredentials.length} active`, tone: "neutral" }
        : { label: "Not issued", tone: "neutral" },
    sync:
      calendarSyncHealth === "error" || Boolean(calendarLastError) || Boolean(gmailLastError)
        ? { label: "Attention", tone: "warning" }
        : isCalendarSyncing || isGoogleToggleSaving || isGmailToggleSaving
          ? { label: "Syncing", tone: "neutral" }
          : calendarSyncEnabled || gmailSyncEnabled
            ? { label: "All synced", tone: "success" }
            : { label: "Off", tone: "neutral" },
    reminders: notificationsEnabled
      ? { label: "On", tone: "success" }
      : { label: "Off", tone: "neutral" },
    interaction: prefs.swipeActionsEnabled
      ? { label: "Swipe on", tone: "neutral" }
      : { label: "Swipe off", tone: "neutral" },
    appearance: { label: "Geist", tone: "neutral" },
    about: {
      label: APP_VERSION.startsWith("v") ? APP_VERSION : `v${APP_VERSION}`,
      tone: "neutral",
    },
  };

  return (
    <Modal
      visible={visible}
      animationType={reducedMotion ? "none" : "fade"}
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={navigation.screen === "detail" ? handleBack : handleClose}
    >
      <View style={styles.modalRoot}>
        <View
          style={[
            styles.headerShell,
            {
              paddingTop: insets.top + spacing.sm,
              paddingBottom: spacing.sm,
            },
          ]}
        >
          <View style={styles.headerRow}>
            <Pressable
              onPress={navigation.screen === "detail" ? handleBack : handleClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={navigation.screen === "detail" ? "Back" : "Close settings"}
              style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.6 }]}
            >
              <ChevronLeftIcon color={colors.textPrimary} size={20} />
            </Pressable>
            <View style={styles.headerTitleWrap}>
              {showKairoHeaderMark ? (
                <KairoIcon color={colors.textSecondary} size={22} />
              ) : null}
              <Text style={styles.headerTitle}>{headerTitle}</Text>
            </View>
            <View style={styles.headerSpacer} />
          </View>
        </View>

        <View
          key={
            navigation.screen === "detail"
              ? `detail-${navigation.category}`
              : "list"
          }
          style={styles.contentWrap}
        >
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: insets.bottom + spacing.section },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {navigation.screen === "list" ? (
              <SettingsCategoryList
                onOpenCategory={handleOpenCategory}
                statuses={settingsHomeStatuses}
              />
            ) : (
              renderDetailScreen(navigation, {
                prefs,
                setPreference,
                automationCredentials,
                automationLabel,
                setAutomationLabel,
                allowTaskWrites,
                setAllowTaskWrites,
                issuedBootstrapToken,
                isIssuingBootstrapToken,
                onIssueBootstrapToken: () => void handleIssueBootstrapToken(),
                onCopy: handleCopy,
                onRevokeCredential: (credentialId) => handleRevokeCredential(credentialId),
                revokingCredentialId,
                calendarSyncEnabled,
                calendarSyncHealth,
                calendarErrorSummary,
                calendarAccountEmail,
                calendarLastRun,
                isGoogleToggleSaving,
                availableCalendars,
                selectedCalendarIds,
                isLoadingCalendars,
                onToggleCalendarSelected,
                syncSettingsBusy,
                isCalendarSyncing,
                onGoogleCalendarToggle,
                onGoogleCalendarSync,
                onEnableAndSyncGoogleCalendar,
                gmailSyncEnabled,
                gmailSyncStatus,
                gmailAccountEmail,
                gmailLastRun,
                pendingGmailReviewCount,
                isGmailToggleSaving,
                canToggleGmailSync,
                onGmailToggle,
                showToast,
                notificationPermissionState,
                notificationsEnabled,
                isNotificationsBusy,
                onRequestNotificationsAccess,
                onSendTestNotification,
                openPicker,
                onOpenPicker: setOpenPicker,
                onTimePicked: handleTimePicked,
                onClosePicker: () => setOpenPicker(null),
                tabOrder,
                onMoveTab: handleMoveTab,
                deviceId,
                onExportDiagnostics,
                calendarLastError,
                gmailLastError,
                isClearingRetryQueue,
                onClearRetryQueue: () => void handleClearRetryQueue(),
                onExportTasks,
                onSignOut,
                dangerArmed,
                isWiping,
                onWipeLocalData: () => void handleWipeLocalData(),
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerShell: {
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  headerAction: {
    width: 40,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  headerTitle: {
    ...typography.headline,
    color: colors.textPrimary,
  },
  headerTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  headerSpacer: {
    width: 40,
    height: 40,
  },
  contentWrap: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  screenBody: {
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  summaryCard: {
    flex: 1,
    minHeight: 88,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    gap: 3,
  },
  summaryKicker: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  summaryValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  summaryMeta: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },
  categoryPanel: {
    overflow: "hidden",
    borderRadius: radii.lg,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  categoryCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 74,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    backgroundColor: colors.bgCard,
  },
  categoryDivider: {
    height: 1,
    backgroundColor: colors.bgInput,
  },
  categoryCopy: {
    flex: 1,
    gap: 2,
  },
  categoryIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  categoryTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  categorySummary: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },
  categoryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  categoryStatus: {
    ...typography.bodyMd,
    fontFamily: "Geist_500Medium",
  },
  categoryChevron: {
    ...typography.title,
    color: colors.accent,
  },
  settingBlock: {
    gap: spacing.sm,
  },
  sectionCard: {
    backgroundColor: colors.bgCard,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  settingCopy: {
    flex: 1,
    gap: 4,
  },
  settingLabel: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  settingHelp: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },
  settingMeta: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  settingStatus: {
    ...typography.bodyMd,
    fontFamily: "Geist_600SemiBold",
  },
  behaviorRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  inlineActionText: {
    ...typography.bodyMd,
    color: colors.accent,
  },
  inlineActionDisabled: {
    color: colors.textDim,
  },
  calendarPickerBlock: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  calendarPickerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  calendarPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  calendarCheckbox: {
    width: 22,
    height: 22,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
  },
  calendarCheckboxChecked: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  calendarCheckmark: {
    ...typography.bodyMd,
    color: colors.accent,
  },
  fieldStack: {
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
    backgroundColor: colors.bgSurface,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  softButton: {
    marginTop: spacing.sm,
    alignSelf: "flex-start",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  softButtonDisabled: {
    opacity: 0.5,
  },
  softButtonText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  tokenBlock: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  copyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  copyRowPill: {
    flex: 1,
  },
  codePill: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  codePillText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  copyButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
  },
  copyButtonText: {
    ...typography.bodyMd,
    color: colors.accent,
    fontFamily: "Geist_600SemiBold",
  },
  credentialList: {
    gap: spacing.sm,
  },
  credentialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  copyChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  copyChipText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  choiceChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  choiceChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  choiceChipText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  choiceChipTextActive: {
    color: colors.accent,
    fontFamily: "Geist_600SemiBold",
  },
  timeInlineButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  timeInlineButtonText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  timeRowValue: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  segmented: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  segment: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    alignItems: "center",
  },
  segmentActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  segmentText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  segmentTextActive: {
    color: colors.accent,
    fontFamily: "Geist_600SemiBold",
  },
  selectionCardSelected: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.accentDim,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderFocus,
  },
  selectionCopy: {
    flex: 1,
    gap: 3,
  },
  selectionTitle: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  selectionDescription: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },
  selectionStatusText: {
    ...typography.micro,
    color: colors.accent,
  },
  optionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  optionCard: {
    minWidth: 0,
    flexBasis: "48%",
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    gap: 3,
  },
  optionCardActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.borderFocus,
  },
  optionTitle: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  optionTitleActive: {
    color: colors.accent,
  },
  optionDescription: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },
  swatchGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  swatchOption: {
    minWidth: 0,
    flexBasis: "48%",
    flexGrow: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  swatchDot: {
    width: 22,
    height: 22,
    borderRadius: radii.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  tabOrderPreview: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  tabPreviewItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
  },
  tabPreviewText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  tabPreviewCapture: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
  },
  tabPreviewCaptureText: {
    ...typography.bodyMd,
    color: colors.accent,
    fontFamily: "Geist_600SemiBold",
  },
  tabOrderEditor: {
    gap: spacing.sm,
  },
  tabOrderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabOrderIndex: {
    width: 28,
    height: 28,
    borderRadius: radii.full,
    backgroundColor: colors.bgSurface,
    alignItems: "center",
    justifyContent: "center",
  },
  tabOrderIndexText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  tabOrderControls: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  tabOrderButton: {
    width: 36,
    height: 36,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  tabOrderButtonDisabled: {
    opacity: 0.5,
  },
  tabOrderButtonText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  tabOrderButtonTextDisabled: {
    color: colors.textDim,
  },
  aboutHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  aboutHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  aboutVersion: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
  versionPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
  },
  versionPillText: {
    ...typography.bodyMd,
    color: colors.accent,
    fontFamily: "Geist_600SemiBold",
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  linkRowText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  linkRowChevron: {
    ...typography.bodyMd,
    color: colors.accent,
  },
  sourceBlock: {
    gap: spacing.sm,
  },
  sourceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radii.full,
  },
  statusDotOk: {
    backgroundColor: colors.primary,
  },
  statusDotErr: {
    backgroundColor: colors.error,
  },
  sourceName: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  sourceStatus: {
    ...typography.bodyMd,
  },
  sourceStatusOk: {
    color: colors.primary,
  },
  sourceStatusErr: {
    color: colors.error,
  },
  errorBlock: {
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
  },
  errorBlockText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  accountCard: {
    gap: spacing.sm,
  },
  signOutButton: {
    alignSelf: "flex-start",
  },
  signOutLink: {
    ...typography.bodyMd,
    color: colors.accent,
  },
  dangerCard: {
    gap: spacing.sm,
    borderColor: colors.errorMuted,
  },
  dangerLabel: {
    ...typography.bodyMd,
    color: colors.error,
    fontFamily: "Geist_600SemiBold",
  },
  sectionFootAction: {
    alignSelf: "flex-start",
  },
  dangerActionText: {
    ...typography.bodyMd,
    color: colors.error,
  },
});
