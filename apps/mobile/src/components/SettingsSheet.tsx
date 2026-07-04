import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type JSX } from "react";
import {
  ActivityIndicator,
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
import { useKeyboardInset } from "../hooks/useKeyboardInset";
import { getOrCreateDeviceId } from "../lib/deviceIdentity";
import { retryQueueStorage } from "../lib/retry-queue-storage";
import { classifyError, mobileLogger } from "../lib/logger";
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  InboxTrayIcon,
  InfoCircleIcon,
  MailIcon,
  SyncLoopIcon,
} from "./UiIcons";
import AboutIconAsset from "../assets/icons/settings-about.svg";
import AppearanceIconAsset from "../assets/icons/settings-appearance.svg";
import InteractionIconAsset from "../assets/icons/settings-interaction.svg";
import KairoIconAsset from "../assets/icons/settings-kairo.svg";
import CliIconAsset from "../assets/icons/settings-cli.svg";
import AppSettingsIconAsset from "../assets/icons/app-settings.svg";
import RemindersIconAsset from "../assets/icons/settings-reminders.svg";
import QuietHoursIconAsset from "../assets/icons/settings-quiet-hours.svg";
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
import type { AccentColor, Density, ReminderLeadTimeMinutes } from "../lib/userPreferences";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
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

function SettingsHomeIcon({ color, size = 18 }: CategoryIconProps) {
  return <AppSettingsIconAsset width={size} height={size} color={color} />;
}

function CliIcon({ color, size = 18 }: CategoryIconProps) {
  return <CliIconAsset width={size} height={size} color={color} />;
}

function BellIcon({ color: _color, size = 18 }: CategoryIconProps) {
  return <RemindersIconAsset width={size} height={size} />;
}

function QuietHoursIcon({ color: _color, size = 18 }: CategoryIconProps) {
  return <QuietHoursIconAsset width={size} height={size} />;
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

function formatShortDate(ts: number): string {
  const date = new Date(ts);
  const month = date.toLocaleString("en-US", { month: "short" });
  return `${month} ${date.getDate()}`;
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

function notificationPermissionLabel(state: NotificationPermissionState): string {
  if (state === "granted") return "Ready";
  if (state === "denied") return "Denied";
  return "Permission needed";
}

function syncHealthLabel(health: SyncHealth): string {
  switch (health) {
    case "healthy":
      return "Connected";
    case "error":
      return "Needs retry";
    case "paused":
      return "Paused";
    case "disconnected":
      return "Off";
  }
}

type SyncBadgeTone = "success" | "warning" | "error" | "muted";

function syncHealthTone(health: SyncHealth): SyncBadgeTone {
  if (health === "healthy") return "success";
  if (health === "error") return "error";
  return "muted";
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
  if (health === "error") return "Retry sync";
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
  onFieldFocus: (field: "apiKey" | "baseUrl" | "model") => void;
};

function KairoSection({ onFieldFocus }: KairoSectionProps) {
  return (
    <View style={styles.screenBody}>
      <View style={[styles.settingBlock, styles.sectionCard]}>
        <KairoSettingsSection onFieldFocus={onFieldFocus} />
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
    createdAt: number;
    lastUsedAt?: number;
  }>;
  issuedBootstrapToken: { token: string; expiresAt: number } | null;
  pendingBootstrapTokens: Array<{
    _id: Id<"automationBootstrapTokens">;
    label: string;
    scopes: string[];
    expiresAt: number;
    createdAt: number;
  }>;
  isIssuingBootstrapToken: boolean;
  isLoadingCredentials: boolean;
  onIssueBootstrapToken: () => void;
  onDismissIssuedToken: () => void;
  onCancelBootstrapToken: (
    bootstrapTokenId: Id<"automationBootstrapTokens">,
  ) => Promise<void>;
  cancellingBootstrapTokenId: Id<"automationBootstrapTokens"> | null;
  onCopy: (value: string, label: string) => Promise<void>;
  onRevokeCredential: (credentialId: Id<"automationCredentials">) => Promise<void>;
  revokingCredentialId: Id<"automationCredentials"> | null;
  onDeleteCredential: (credentialId: Id<"automationCredentials">) => Promise<void>;
  deletingCredentialId: Id<"automationCredentials"> | null;
  onSetTaskWrites: (
    credentialId: Id<"automationCredentials">,
    allow: boolean,
  ) => Promise<void>;
  onRenameCredential: (
    credentialId: Id<"automationCredentials">,
    label: string,
  ) => Promise<void>;
  updatingCredentialId: Id<"automationCredentials"> | null;
};

function CliCredentialsSection({
  automationCredentials,
  issuedBootstrapToken,
  pendingBootstrapTokens,
  isIssuingBootstrapToken,
  isLoadingCredentials,
  onIssueBootstrapToken,
  onDismissIssuedToken,
  onCancelBootstrapToken,
  cancellingBootstrapTokenId,
  onCopy,
  onRevokeCredential,
  revokingCredentialId,
  onDeleteCredential,
  deletingCredentialId,
  onSetTaskWrites,
  onRenameCredential,
  updatingCredentialId,
}: CliCredentialsSectionProps) {
  const reducedMotion = useReducedMotion();
  const [expandedId, setExpandedId] =
    useState<Id<"automationCredentials"> | null>(null);
  const [renamingId, setRenamingId] =
    useState<Id<"automationCredentials"> | null>(null);
  const [renameText, setRenameText] = useState("");
  const [tokenCopied, setTokenCopied] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void;
  } | null>(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );

  // Hide the pending row for the token currently shown in the "new token" card
  // (expiresAt is a unique server timestamp), so it isn't listed twice.
  const visiblePending = pendingBootstrapTokens.filter(
    (token) =>
      !issuedBootstrapToken || token.expiresAt !== issuedBootstrapToken.expiresAt,
  );
  const hasPending = visiblePending.length > 0;

  // Keep issued/pending token countdowns live while any are on screen.
  useEffect(() => {
    if (!issuedBootstrapToken && !hasPending) return;
    const seed = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearTimeout(seed);
      clearInterval(id);
    };
  }, [issuedBootstrapToken, hasPending]);

  const handleCopyToken = async (token: string) => {
    await onCopy(token, "Bootstrap token");
    setTokenCopied(true);
    if (copyResetRef.current) clearTimeout(copyResetRef.current);
    copyResetRef.current = setTimeout(() => setTokenCopied(false), 2000);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameText("");
  };

  const issuedMsLeft = issuedBootstrapToken
    ? issuedBootstrapToken.expiresAt - now
    : 0;
  const isIssuedExpired = issuedMsLeft <= 0;
  const issuedMinsLeft = Math.max(0, Math.ceil(issuedMsLeft / 60000));

  const hasTokens = automationCredentials.length > 0;

  const beginRename = (id: Id<"automationCredentials">, label: string) => {
    setRenamingId(id);
    setRenameText(label);
  };

  const commitRename = async (id: Id<"automationCredentials">) => {
    const next = renameText.trim();
    setRenamingId(null);
    if (next) {
      await onRenameCredential(id, next);
    }
  };

  return (
    <View style={styles.screenBody}>
      {issuedBootstrapToken ? (
        <View style={[styles.sectionCard, styles.issuedCard]}>
          <View style={styles.issuedHeader}>
            <Text style={styles.fieldLabel}>New bootstrap token</Text>
            <Text
              style={[
                styles.issuedExpiry,
                isIssuedExpired && styles.issuedExpiryExpired,
              ]}
            >
              {isIssuedExpired ? "Expired" : `Expires in ${issuedMinsLeft} min`}
            </Text>
          </View>
          <View style={styles.copyRow}>
            <View
              style={[
                styles.codePill,
                styles.copyRowPill,
                isIssuedExpired && styles.codePillMuted,
              ]}
            >
              <Text
                selectable
                style={[
                  styles.tokenMono,
                  isIssuedExpired && styles.tokenMonoMuted,
                ]}
                numberOfLines={1}
              >
                {issuedBootstrapToken.token}
              </Text>
            </View>
            <Pressable
              onPress={() => void handleCopyToken(issuedBootstrapToken.token)}
              disabled={isIssuedExpired}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={tokenCopied ? "Token copied" : "Copy bootstrap token"}
              style={({ pressed }) => [
                styles.copyButton,
                tokenCopied && styles.copyButtonDone,
                isIssuedExpired && styles.softButtonDisabled,
                pressed && { opacity: 0.6 },
              ]}
            >
              {tokenCopied ? (
                <CheckIcon color={colors.success} size={16} />
              ) : (
                <CopyIcon
                  color={isIssuedExpired ? colors.textDim : colors.textPrimary}
                  size={16}
                />
              )}
            </Pressable>
          </View>
          <Text style={styles.issuedHint}>
            {isIssuedExpired ? (
              "This token expired before it was used. Issue a new one to connect the CLI."
            ) : (
              <>
                You won&rsquo;t see this token again — copy it now, then run{" "}
                <Text style={styles.issuedHintMono}>pravah setup</Text> and paste
                it to finish.
              </>
            )}
          </Text>
          <Pressable
            onPress={onDismissIssuedToken}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Dismiss token"
            style={({ pressed }) => [
              styles.ghostButton,
              styles.issuedDoneButton,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.ghostButtonText}>
              {isIssuedExpired ? "Dismiss" : "Done"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {hasPending ? (
        <View style={styles.sectionCard}>
          <View style={styles.tokensHeader}>
            <Text style={styles.settingLabel}>Pending setup</Text>
          </View>
          <Text style={styles.issuedHint}>
            Issued but not connected yet. Run{" "}
            <Text style={styles.issuedHintMono}>pravah setup</Text> with the
            copied token to finish, or cancel it below.
          </Text>
          <View style={styles.tokenList}>
            {visiblePending.map((token, index) => {
              const mins = Math.max(
                0,
                Math.ceil((token.expiresAt - now) / 60000),
              );
              const isCancelling = cancellingBootstrapTokenId === token._id;
              return (
                <View key={token._id}>
                  {index > 0 ? <View style={styles.tokenDivider} /> : null}
                  <View style={styles.tokenRow}>
                    <View style={styles.tokenIconTile}>
                      <CliIcon color={colors.textSecondary} size={18} />
                    </View>
                    <View style={styles.tokenRowCopy}>
                      <Text style={styles.tokenName} numberOfLines={1}>
                        {token.label}
                      </Text>
                      <Text style={styles.pendingMeta}>
                        Waiting · expires in {mins} min
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => void onCancelBootstrapToken(token._id)}
                      disabled={isCancelling}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel ${token.label}`}
                      style={({ pressed }) => [
                        styles.ghostButton,
                        pressed && { opacity: 0.6 },
                        isCancelling && styles.softButtonDisabled,
                      ]}
                    >
                      <Text style={styles.ghostButtonText}>
                        {isCancelling ? "Cancelling…" : "Cancel"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {hasTokens ? (
        <View style={styles.sectionCard}>
          <View style={styles.tokensHeader}>
            <Text style={styles.settingLabel}>Your tokens</Text>
            <Pressable
              onPress={onIssueBootstrapToken}
              disabled={isIssuingBootstrapToken}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Issue token"
              style={({ pressed }) => [
                styles.newTokenChip,
                pressed && { opacity: 0.6 },
                isIssuingBootstrapToken && styles.softButtonDisabled,
              ]}
            >
              <Text style={styles.newTokenChipText}>
                {isIssuingBootstrapToken ? "Issuing…" : "+ New"}
              </Text>
            </Pressable>
          </View>

          <View style={styles.tokenList}>
            {automationCredentials.map((credential, index) => {
              const isRevoked = credential.status === "revoked";
              const isExpanded = expandedId === credential._id;
              const isRenaming = renamingId === credential._id;
              const writesOn = credential.scopes.includes("tasks:write");
              const isBusy = updatingCredentialId === credential._id;
              const isDeleting = deletingCredentialId === credential._id;
              const isRevoking = revokingCredentialId === credential._id;
              const lastUsed = formatRelativeTime(credential.lastUsedAt);
              const tokenSubtitle = `${writesOn ? "Read & write" : "Read-only"} · ${
                lastUsed
                  ? `Last used ${lastUsed}`
                  : `Created ${formatShortDate(credential.createdAt)}`
              }`;
              return (
                <View key={credential._id}>
                  {index > 0 ? <View style={styles.tokenDivider} /> : null}
                  <Pressable
                    onPress={() =>
                      setExpandedId(isExpanded ? null : credential._id)
                    }
                    style={({ pressed }) => [
                      styles.tokenRow,
                      pressed && { opacity: 0.84 },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel={`${credential.label} token`}
                    accessibilityState={{ expanded: isExpanded }}
                  >
                    <View style={styles.tokenIconTile}>
                      <CliIcon color={colors.textSecondary} size={18} />
                    </View>
                    <View style={styles.tokenRowCopy}>
                      <View style={styles.tokenRowTop}>
                        <Text style={styles.tokenName} numberOfLines={1}>
                          {credential.label}
                        </Text>
                        <View
                          style={[
                            styles.statusBadge,
                            isRevoked
                              ? styles.statusBadgeIdle
                              : styles.statusBadgeActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.statusBadgeText,
                              isRevoked
                                ? styles.statusBadgeTextIdle
                                : styles.statusBadgeTextActive,
                            ]}
                          >
                            {isRevoked ? "Revoked" : "Active"}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.tokenSubtitle} numberOfLines={1}>
                        {tokenSubtitle}
                      </Text>
                    </View>
                    <View
                      style={[
                        styles.rowChevron,
                        isExpanded && styles.rowChevronExpanded,
                      ]}
                    >
                      <ChevronRightIcon color={colors.textDim} size={18} />
                    </View>
                  </Pressable>

                  {isExpanded ? (
                    <View style={styles.tokenPanel}>
                      <Text style={styles.fieldLabel}>Token</Text>
                      <View style={styles.codePill}>
                        <Text style={styles.tokenMono} numberOfLines={1}>
                          {credential.credentialPreview}
                        </Text>
                      </View>

                      {isRenaming ? (
                        <View style={styles.renameRow}>
                          <TextInput
                            value={renameText}
                            onChangeText={setRenameText}
                            autoFocus
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholder="Token name"
                            placeholderTextColor={colors.textDim}
                            style={[styles.textInput, styles.renameInput]}
                            accessibilityLabel="Token name"
                            onSubmitEditing={() => void commitRename(credential._id)}
                          />
                          <Pressable
                            onPress={cancelRename}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel="Cancel rename"
                            style={({ pressed }) => [
                              styles.ghostButton,
                              pressed && { opacity: 0.6 },
                            ]}
                          >
                            <Text style={styles.ghostButtonText}>Cancel</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => void commitRename(credential._id)}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel="Save token name"
                            style={({ pressed }) => [
                              styles.copyButton,
                              pressed && { opacity: 0.6 },
                            ]}
                          >
                            <Text style={styles.copyButtonText}>Save</Text>
                          </Pressable>
                        </View>
                      ) : null}

                      {!isRevoked ? (
                        <View style={styles.behaviorRow}>
                          <View style={styles.settingCopy}>
                            <Text style={styles.settingLabel}>Allow task writes</Text>
                            <Text style={styles.settingHelp}>
                              Lets this token create and edit your tasks.
                            </Text>
                          </View>
                          <Switch
                            value={writesOn}
                            onValueChange={(next) =>
                              void onSetTaskWrites(credential._id, next)
                            }
                            disabled={isBusy}
                            trackColor={{ false: colors.border, true: colors.warningMuted }}
                            thumbColor={writesOn ? colors.warning : colors.textMuted}
                          />
                        </View>
                      ) : null}

                      <View style={styles.tokenActions}>
                        {!isRevoked && !isRenaming ? (
                          <Pressable
                            onPress={() =>
                              beginRename(credential._id, credential.label)
                            }
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel={`Rename ${credential.label}`}
                            style={({ pressed }) => [
                              styles.ghostButton,
                              pressed && { opacity: 0.6 },
                            ]}
                          >
                            <Text style={styles.ghostButtonText}>Rename</Text>
                          </Pressable>
                        ) : null}
                        {isRevoked ? (
                          <Pressable
                            onPress={() =>
                              setConfirmDialog({
                                title: "Remove token?",
                                message: `“${credential.label}” will be permanently deleted.`,
                                confirmLabel: "Remove",
                                onConfirm: () =>
                                  void onDeleteCredential(credential._id),
                              })
                            }
                            disabled={isDeleting}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel={`Remove ${credential.label}`}
                            style={({ pressed }) => [
                              styles.ghostButton,
                              pressed && { opacity: 0.6 },
                              isDeleting && styles.softButtonDisabled,
                            ]}
                          >
                            <Text style={styles.ghostButtonText}>
                              {isDeleting ? "Removing…" : "Remove"}
                            </Text>
                          </Pressable>
                        ) : (
                          <Pressable
                            onPress={() =>
                              setConfirmDialog({
                                title: "Revoke token?",
                                message: `“${credential.label}” will stop working immediately. This can't be undone.`,
                                confirmLabel: "Revoke",
                                onConfirm: () =>
                                  void onRevokeCredential(credential._id),
                              })
                            }
                            disabled={isRevoking}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel={`Revoke ${credential.label}`}
                            style={({ pressed }) => [
                              styles.revokeButton,
                              pressed && { opacity: 0.6 },
                              isRevoking && styles.softButtonDisabled,
                            ]}
                          >
                            <Text style={styles.revokeButtonText}>
                              {isRevoking ? "Revoking…" : "Revoke"}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : issuedBootstrapToken || hasPending ? null : isLoadingCredentials ? (
        <View style={[styles.sectionCard, styles.emptyCard]}>
          <ActivityIndicator color={colors.textDim} />
        </View>
      ) : (
        <View style={[styles.sectionCard, styles.emptyCard]}>
          <View style={styles.emptyIconTile}>
            <CliIcon color={colors.textSecondary} size={22} />
          </View>
          <Text style={styles.emptyTitle}>No tokens yet</Text>
          <Text style={styles.emptyHelp}>
            Create one to connect the pravah CLI.
          </Text>
          <Pressable
            onPress={onIssueBootstrapToken}
            disabled={isIssuingBootstrapToken}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Issue token"
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && { opacity: 0.85 },
              isIssuingBootstrapToken && styles.softButtonDisabled,
            ]}
          >
            <Text style={styles.primaryButtonText}>
              {isIssuingBootstrapToken ? "Issuing…" : "Issue token"}
            </Text>
          </Pressable>
        </View>
      )}

      <Modal
        visible={confirmDialog !== null}
        transparent
        animationType={reducedMotion ? "none" : "fade"}
        statusBarTranslucent
        onRequestClose={() => setConfirmDialog(null)}
      >
        <Pressable
          style={styles.confirmBackdrop}
          onPress={() => setConfirmDialog(null)}
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
        >
          <Pressable style={styles.confirmCard} onPress={() => {}}>
            <Text style={styles.confirmTitle}>{confirmDialog?.title}</Text>
            <Text style={styles.confirmMessage}>{confirmDialog?.message}</Text>
            <View style={styles.confirmActions}>
              <Pressable
                onPress={() => setConfirmDialog(null)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Cancel"
                style={({ pressed }) => [
                  styles.ghostButton,
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Text style={styles.ghostButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  confirmDialog?.onConfirm();
                  setConfirmDialog(null);
                }}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={confirmDialog?.confirmLabel}
                style={({ pressed }) => [
                  styles.confirmDestructiveButton,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <Text style={styles.confirmDestructiveText}>
                  {confirmDialog?.confirmLabel}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
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
  const calendarMetaLine = [
    calendarAccountEmail?.toLowerCase(),
    describeLastRun(calendarLastRun),
  ]
    .filter(Boolean)
    .join(" · ");
  const gmailMetaLine = [gmailAccountEmail?.toLowerCase(), describeLastRun(gmailLastRun)]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={styles.screenBody}>
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <View style={styles.summaryKickerRow}>
            <CalendarIcon color={colors.textMuted} size={13} strokeWidth={1.8} />
            <Text style={styles.summaryKicker}>Calendar</Text>
          </View>
          <Text style={styles.summaryValue}>{syncHealthLabel(calendarSyncHealth)}</Text>
          <Text style={styles.summaryMeta}>
            {describeLastRun(calendarLastRun) ??
              (calendarSyncEnabled ? "Timeline import on" : "Timeline import off")}
          </Text>
        </View>
        <View style={styles.summaryCard}>
          <View style={styles.summaryKickerRow}>
            <MailIcon color={colors.textMuted} size={13} strokeWidth={1.8} />
            <Text style={styles.summaryKicker}>Gmail</Text>
          </View>
          <Text style={styles.summaryValue}>{formatStatusLabel(gmailSyncStatus)}</Text>
          <Text style={styles.summaryMeta}>
            {pendingGmailReviewCount > 0
              ? `${pendingGmailReviewCount} awaiting review`
              : gmailSyncEnabled
                ? "Nothing to review"
                : "Review capture off"}
          </Text>
        </View>
      </View>

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <View style={styles.settingRow}>
          <View style={styles.syncIconWrap}>
            <CalendarIcon color={colors.textSecondary} size={18} />
          </View>
          <View style={styles.settingCopy}>
            <View style={styles.syncTitleRow}>
              <Text style={styles.settingLabel}>Google Calendar</Text>
              <SyncStatusBadge
                label={syncHealthLabel(calendarSyncHealth)}
                tone={syncHealthTone(calendarSyncHealth)}
              />
            </View>
            <Text style={styles.settingHelp}>Pull events and deadlines into Pravah.</Text>
            {calendarMetaLine ? (
              <Text style={styles.settingMeta}>{calendarMetaLine}</Text>
            ) : null}
          </View>
          <Switch
            value={calendarSyncEnabled}
            onValueChange={onGoogleCalendarToggle}
            disabled={isGoogleToggleSaving}
            trackColor={{ false: colors.border, true: colors.warningMuted }}
            thumbColor={calendarSyncEnabled ? colors.warning : colors.textMuted}
          />
        </View>
        {calendarSyncHealth === "error" && calendarErrorSummary ? (
          <View style={styles.syncErrorCallout}>
            <AlertCircleIcon color={colors.error} size={16} />
            <Text style={styles.syncErrorText}>{calendarErrorSummary}</Text>
          </View>
        ) : null}
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
        <View style={styles.syncHintRow}>
          <InfoCircleIcon color={colors.textMuted} size={14} strokeWidth={1.8} />
          <Text style={styles.syncHintText}>
            One-way import — changes in Pravah don't write back to Google.
          </Text>
        </View>
        <Pressable
          onPress={
            calendarSyncHealth === "healthy"
              ? onGoogleCalendarSync
              : onEnableAndSyncGoogleCalendar
          }
          disabled={syncSettingsBusy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${calendarActionLabel(calendarSyncHealth, isCalendarSyncing)} Google Calendar`}
          style={({ pressed }) => [
            styles.syncActionButton,
            pressed && { opacity: 0.7 },
            syncSettingsBusy && styles.syncActionButtonDisabled,
          ]}
        >
          <SyncLoopIcon
            color={syncSettingsBusy ? colors.textDim : colors.textPrimary}
            size={16}
          />
          <Text style={[styles.syncActionText, syncSettingsBusy && { color: colors.textDim }]}>
            {calendarActionLabel(calendarSyncHealth, isCalendarSyncing)}
          </Text>
        </Pressable>
      </View>

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <View style={styles.settingRow}>
          <View style={styles.syncIconWrap}>
            <MailIcon color={colors.textSecondary} size={18} />
          </View>
          <View style={styles.settingCopy}>
            <View style={styles.syncTitleRow}>
              <Text style={styles.settingLabel}>Gmail</Text>
              <SyncStatusBadge
                label={formatStatusLabel(gmailSyncStatus)}
                tone={getStatusTone(gmailSyncStatus)}
              />
            </View>
            <Text style={styles.settingHelp}>Surface pending email follow-ups for review.</Text>
            {gmailMetaLine ? <Text style={styles.settingMeta}>{gmailMetaLine}</Text> : null}
          </View>
          <Switch
            value={gmailSyncEnabled}
            onValueChange={onGmailToggle}
            disabled={isGmailToggleSaving || !canToggleGmailSync}
            trackColor={{ false: colors.border, true: colors.warningMuted }}
            thumbColor={gmailSyncEnabled ? colors.warning : colors.textMuted}
          />
        </View>
        {pendingGmailReviewCount > 0 ? (
          <View style={styles.syncHintRow}>
            <InboxTrayIcon color={colors.textMuted} size={14} strokeWidth={1.8} />
            <Text style={styles.syncHintText}>
              {pendingGmailReviewCount} captured{" "}
              {pendingGmailReviewCount === 1 ? "item" : "items"} waiting for review
            </Text>
          </View>
        ) : null}
        {!canToggleGmailSync ? (
          <View style={styles.syncHintRow}>
            <InfoCircleIcon color={colors.textMuted} size={14} strokeWidth={1.8} />
            <Text style={styles.syncHintText}>
              Connect Gmail on web before enabling mobile sync.
            </Text>
          </View>
        ) : null}
        <GmailReviewSection enabled={gmailSyncEnabled} showToast={showToast} />
      </View>
    </View>
  );
}

function SyncStatusBadge({ label, tone }: { label: string; tone: SyncBadgeTone }) {
  return (
    <View
      style={[
        styles.statusBadge,
        tone === "success"
          ? styles.statusBadgeActive
          : tone === "error"
            ? styles.statusBadgeError
            : tone === "warning"
              ? styles.statusBadgeWarning
              : styles.statusBadgeIdle,
      ]}
    >
      <Text
        style={[
          styles.statusBadgeText,
          tone === "success"
            ? styles.statusBadgeTextActive
            : tone === "error"
              ? styles.statusBadgeTextError
              : tone === "warning"
                ? styles.statusBadgeTextWarning
                : styles.statusBadgeTextIdle,
        ]}
      >
        {label}
      </Text>
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
      <View style={[styles.settingBlock, styles.sectionCard]}>
        <View style={styles.settingRow}>
          <View style={styles.syncIconWrap}>
            <BellIcon color={colors.textSecondary} size={18} />
          </View>
          <View style={styles.settingCopy}>
            <View style={styles.syncTitleRow}>
              <Text style={styles.settingLabel}>Notifications</Text>
              <SyncStatusBadge
                label={notificationPermissionLabel(notificationPermissionState)}
                tone={getStatusTone(notificationPermissionState)}
              />
            </View>
            <Text style={styles.settingHelp}>
              Timed tasks notify at their deadline, and date-only tasks roll into one morning
              digest.
            </Text>
          </View>
        </View>

        <View style={styles.behaviorRow}>
          <Text style={styles.settingMeta}>
            {notificationsEnabled ? "Check delivery" : "Alerts on this device"}
          </Text>
          <Pressable
            onPress={notificationsEnabled ? onSendTestNotification : onRequestNotificationsAccess}
            disabled={isNotificationsBusy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              notificationsEnabled ? "Send a test notification" : "Enable notifications"
            }
            style={({ pressed }) => [
              styles.timeInlineButton,
              pressed && { opacity: 0.7 },
              isNotificationsBusy && styles.syncActionButtonDisabled,
            ]}
          >
            <Text
              style={[
                styles.timeInlineButtonText,
                { fontFamily: "Geist_600SemiBold" },
                isNotificationsBusy && { color: colors.textDim },
              ]}
            >
              {notificationsEnabled ? "Send a test" : "Enable"}
            </Text>
          </Pressable>
        </View>

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

        <View style={styles.behaviorStack}>
          <Text style={styles.settingMeta}>Heads-up lead time</Text>
          <LeadTimeSegmented
            value={prefs.reminderLeadTimeMinutes}
            onSelect={(minutes) => void setPreference("reminderLeadTimeMinutes", minutes)}
          />
        </View>
      </View>

      <View style={[styles.settingBlock, styles.sectionCard]}>
        <View style={styles.settingRow}>
          <View style={styles.syncIconWrap}>
            <QuietHoursIcon color={colors.textSecondary} size={18} />
          </View>
          <View style={styles.settingCopy}>
            <Text style={styles.settingLabel}>Quiet hours</Text>
            <Text style={styles.settingHelp}>
              Auto-scheduled alerts wait until quiet hours end.
            </Text>
          </View>
          <Switch
            value={prefs.quietHoursEnabled}
            onValueChange={(next) => void setPreference("quietHoursEnabled", next)}
            trackColor={{ false: colors.border, true: colors.warningMuted }}
            thumbColor={prefs.quietHoursEnabled ? colors.warning : colors.textMuted}
          />
        </View>

        {prefs.quietHoursEnabled ? (
          <>
            <View style={styles.behaviorRow}>
              <Text style={styles.settingMeta}>Starts</Text>
              <Pressable
                onPress={() => onOpenPicker("quietStart")}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Change quiet hours start, currently ${formatClockLabel(prefs.quietHoursStart)}`}
                style={({ pressed }) => [styles.timeInlineButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.timeInlineButtonText}>
                  {formatClockLabel(prefs.quietHoursStart)}
                </Text>
              </Pressable>
            </View>

            <View style={styles.behaviorRow}>
              <Text style={styles.settingMeta}>Ends</Text>
              <Pressable
                onPress={() => onOpenPicker("quietEnd")}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={`Change quiet hours end, currently ${formatClockLabel(prefs.quietHoursEnd)}`}
                style={({ pressed }) => [styles.timeInlineButton, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.timeInlineButtonText}>
                  {formatClockLabel(prefs.quietHoursEnd)}
                </Text>
              </Pressable>
            </View>

            <View style={styles.syncHintRow}>
              <InfoCircleIcon color={colors.textMuted} size={14} strokeWidth={1.8} />
              <Text style={styles.syncHintText}>
                Reminders with a time you set yourself still fire during quiet hours.
              </Text>
            </View>
          </>
        ) : null}
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

const SEGMENT_TRACK_PADDING = 3;

function LeadTimeSegmented({
  value,
  onSelect,
}: {
  value: ReminderLeadTimeMinutes;
  onSelect: (minutes: ReminderLeadTimeMinutes) => void;
}) {
  const reducedMotion = useReducedMotion();
  const [innerWidth, setInnerWidth] = useState(0);
  const index = Math.max(0, REMINDER_LEAD_TIME_OPTIONS.indexOf(value));
  const progress = useSharedValue(index);

  useEffect(() => {
    progress.value = reducedMotion
      ? index
      : withSpring(index, { damping: 15, stiffness: 220, mass: 0.7 });
  }, [index, progress, reducedMotion]);

  const segmentWidth =
    innerWidth > 0 ? innerWidth / REMINDER_LEAD_TIME_OPTIONS.length : 0;

  const thumbStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateX: progress.value * segmentWidth }],
    }),
    [segmentWidth],
  );

  return (
    <View
      style={styles.segmentedTrack}
      onLayout={(event) =>
        setInnerWidth(event.nativeEvent.layout.width - SEGMENT_TRACK_PADDING * 2)
      }
    >
      {segmentWidth > 0 ? (
        <Animated.View
          style={[styles.segmentedThumb, { width: segmentWidth }, thumbStyle]}
        />
      ) : null}
      {REMINDER_LEAD_TIME_OPTIONS.map((minutes, optionIndex) => (
        <SegmentOption
          key={minutes}
          label={`${minutes}m`}
          selected={value === minutes}
          optionIndex={optionIndex}
          progress={progress}
          onPress={() => onSelect(minutes)}
        />
      ))}
    </View>
  );
}

function SegmentOption({
  label,
  selected,
  optionIndex,
  progress,
  onPress,
}: {
  label: string;
  selected: boolean;
  optionIndex: number;
  progress: ReturnType<typeof useSharedValue<number>>;
  onPress: () => void;
}) {
  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [optionIndex - 1, optionIndex, optionIndex + 1],
      [colors.textMuted, colors.textInverse, colors.textMuted],
    ),
  }));

  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={styles.segmentedOption}
    >
      <Animated.Text style={[styles.segmentedOptionText, labelStyle]}>{label}</Animated.Text>
    </Pressable>
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
    onKairoFieldFocus: (field: "apiKey" | "baseUrl" | "model") => void;
    automationCredentials: Array<{
      _id: Id<"automationCredentials">;
      label: string;
      credentialPreview: string;
      status: string;
      scopes: string[];
      createdAt: number;
      lastUsedAt?: number;
    }>;
    issuedBootstrapToken: { token: string; expiresAt: number } | null;
    pendingBootstrapTokens: Array<{
      _id: Id<"automationBootstrapTokens">;
      label: string;
      scopes: string[];
      expiresAt: number;
      createdAt: number;
    }>;
    isIssuingBootstrapToken: boolean;
    isLoadingCredentials: boolean;
    onIssueBootstrapToken: () => void;
    onDismissIssuedToken: () => void;
    onCancelBootstrapToken: (
      bootstrapTokenId: Id<"automationBootstrapTokens">,
    ) => Promise<void>;
    cancellingBootstrapTokenId: Id<"automationBootstrapTokens"> | null;
    onCopy: (value: string, label: string) => Promise<void>;
    onRevokeCredential: (credentialId: Id<"automationCredentials">) => Promise<void>;
    revokingCredentialId: Id<"automationCredentials"> | null;
    onDeleteCredential: (credentialId: Id<"automationCredentials">) => Promise<void>;
    deletingCredentialId: Id<"automationCredentials"> | null;
    onSetTaskWrites: (
      credentialId: Id<"automationCredentials">,
      allow: boolean,
    ) => Promise<void>;
    onRenameCredential: (
      credentialId: Id<"automationCredentials">,
      label: string,
    ) => Promise<void>;
    updatingCredentialId: Id<"automationCredentials"> | null;
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
      return (
        <KairoSection
          prefs={props.prefs}
          setPreference={props.setPreference}
          onFieldFocus={props.onKairoFieldFocus}
        />
      );
    case "cli":
      return (
        <CliCredentialsSection
          automationCredentials={props.automationCredentials}
          issuedBootstrapToken={props.issuedBootstrapToken}
          pendingBootstrapTokens={props.pendingBootstrapTokens}
          isIssuingBootstrapToken={props.isIssuingBootstrapToken}
          isLoadingCredentials={props.isLoadingCredentials}
          onIssueBootstrapToken={props.onIssueBootstrapToken}
          onDismissIssuedToken={props.onDismissIssuedToken}
          onCancelBootstrapToken={props.onCancelBootstrapToken}
          cancellingBootstrapTokenId={props.cancellingBootstrapTokenId}
          onCopy={props.onCopy}
          onRevokeCredential={props.onRevokeCredential}
          revokingCredentialId={props.revokingCredentialId}
          onDeleteCredential={props.onDeleteCredential}
          deletingCredentialId={props.deletingCredentialId}
          onSetTaskWrites={props.onSetTaskWrites}
          onRenameCredential={props.onRenameCredential}
          updatingCredentialId={props.updatingCredentialId}
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
  const bottomInset = useKeyboardInset(insets.bottom);
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const kairoFocusScrollTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [navigation, dispatchNavigation] = useReducer(
    settingsNavigationReducer,
    INITIAL_SETTINGS_NAVIGATION,
  );
  const activeCategory = navigation.screen === "detail" ? navigation.category : null;
  const { prefs, setPreference } = useUserPreferences();
  const tabOrder = resolveTabOrder(prefs.tabOrder);
  const [openPicker, setOpenPicker] = useState<QuietPickerKind | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [isClearingRetryQueue, setIsClearingRetryQueue] = useState(false);
  const [dangerArmed, setDangerArmed] = useState<"wipe" | null>(null);
  const [isWiping, setIsWiping] = useState(false);
  const [issuedBootstrapToken, setIssuedBootstrapToken] = useState<{
    token: string;
    expiresAt: number;
  } | null>(null);
  const [isIssuingBootstrapToken, setIsIssuingBootstrapToken] = useState(false);
  const [revokingCredentialId, setRevokingCredentialId] =
    useState<Id<"automationCredentials"> | null>(null);
  const [updatingCredentialId, setUpdatingCredentialId] =
    useState<Id<"automationCredentials"> | null>(null);
  const [deletingCredentialId, setDeletingCredentialId] =
    useState<Id<"automationCredentials"> | null>(null);
  const [cancellingBootstrapTokenId, setCancellingBootstrapTokenId] =
    useState<Id<"automationBootstrapTokens"> | null>(null);
  const [kairoHomeStatus, setKairoHomeStatus] = useState<SettingsHomeStatus>({
    label: "Checking",
    tone: "neutral",
  });
  const issueBootstrapToken = useMutation(api.automation.issueBootstrapToken);
  const revokeCredential = useMutation(api.automation.revokeCredential);
  const updateCredential = useMutation(api.automation.updateCredential);
  const deleteCredential = useMutation(api.automation.deleteCredential);
  const cancelBootstrapToken = useMutation(api.automation.cancelBootstrapToken);
  const automationCredentialsResult = useQuery(api.automation.listCredentials, {});
  const automationCredentials = useMemo(
    () => automationCredentialsResult ?? [],
    [automationCredentialsResult],
  );
  const pendingBootstrapTokensResult = useQuery(
    api.automation.listBootstrapTokens,
    {},
  );
  const pendingBootstrapTokens = useMemo(
    () => pendingBootstrapTokensResult ?? [],
    [pendingBootstrapTokensResult],
  );
  const isLoadingCredentials = automationCredentialsResult === undefined;
  const issuedAtCredentialCountRef = useRef(0);

  // Clear the freshly-issued token card once the CLI exchanges it (the new
  // credential shows up in the list, so the one-time token is now redundant).
  useEffect(() => {
    if (!issuedBootstrapToken) return;
    if (automationCredentials.length > issuedAtCredentialCountRef.current) {
      setIssuedBootstrapToken(null);
    }
  }, [automationCredentials.length, issuedBootstrapToken]);

  useEffect(() => {
    if (!dangerArmed) return;
    const timeout = setTimeout(() => setDangerArmed(null), 5000);
    return () => clearTimeout(timeout);
  }, [dangerArmed]);

  const handleKairoFieldFocus = useCallback((field: "apiKey" | "baseUrl" | "model") => {
    if (!visible || activeCategory !== "kairo") return;

    if (kairoFocusScrollTimeout.current) clearTimeout(kairoFocusScrollTimeout.current);
    kairoFocusScrollTimeout.current = setTimeout(() => {
      if (field === "apiKey") {
        scrollRef.current?.scrollTo({ y: 240, animated: true });
      } else {
        scrollRef.current?.scrollToEnd({ animated: true });
      }
      kairoFocusScrollTimeout.current = null;
    }, 120);
  }, [activeCategory, visible]);

  useEffect(() => {
    if (kairoFocusScrollTimeout.current) {
      clearTimeout(kairoFocusScrollTimeout.current);
      kairoFocusScrollTimeout.current = null;
    }
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
    setIsIssuingBootstrapToken(true);
    issuedAtCredentialCountRef.current = automationCredentials.length;
    try {
      const existingLabels = new Set(automationCredentials.map((c) => c.label));
      let counter = automationCredentials.length + 1;
      let label = `Token ${counter}`;
      while (existingLabels.has(label)) {
        counter += 1;
        label = `Token ${counter}`;
      }
      const result = await issueBootstrapToken({
        label,
        scopes: [...READ_ONLY_AUTOMATION_SCOPES],
        ttlMinutes: 15,
      });
      setIssuedBootstrapToken({ token: result.bootstrapToken, expiresAt: result.expiresAt });
      await Clipboard.setStringAsync(result.bootstrapToken);
      showToast({ kind: "info", message: "Token issued and copied." });
    } catch (error) {
      mobileLogger.warn("automation_bootstrap_issue_failed", { errorType: classifyError(error) });
      showToast({ kind: "error", message: "Could not issue token." });
    } finally {
      setIsIssuingBootstrapToken(false);
    }
  }, [automationCredentials, issueBootstrapToken, showToast]);

  const handleDismissIssuedToken = useCallback(() => {
    setIssuedBootstrapToken(null);
  }, []);

  const handleCancelBootstrapToken = useCallback(
    async (bootstrapTokenId: Id<"automationBootstrapTokens">) => {
      setCancellingBootstrapTokenId(bootstrapTokenId);
      try {
        await cancelBootstrapToken({ bootstrapTokenId });
        showToast({ kind: "info", message: "Pending token cancelled." });
      } catch (error) {
        mobileLogger.warn("automation_bootstrap_cancel_failed", {
          errorType: classifyError(error),
        });
        showToast({ kind: "error", message: "Could not cancel token." });
      } finally {
        setCancellingBootstrapTokenId(null);
      }
    },
    [cancelBootstrapToken, showToast],
  );

  const handleDeleteCredential = useCallback(
    async (credentialId: Id<"automationCredentials">) => {
      setDeletingCredentialId(credentialId);
      try {
        await deleteCredential({ credentialId });
        showToast({ kind: "info", message: "Token removed." });
      } catch (error) {
        mobileLogger.warn("automation_credential_delete_failed", {
          errorType: classifyError(error),
        });
        showToast({ kind: "error", message: "Could not remove token." });
      } finally {
        setDeletingCredentialId(null);
      }
    },
    [deleteCredential, showToast],
  );

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

  const handleSetTaskWrites = useCallback(
    async (credentialId: Id<"automationCredentials">, allow: boolean) => {
      setUpdatingCredentialId(credentialId);
      try {
        await updateCredential({ credentialId, allowTaskWrites: allow });
        showToast({
          kind: "info",
          message: allow ? "Task writes enabled." : "Task writes disabled.",
        });
      } catch (error) {
        mobileLogger.warn("automation_credential_update_failed", {
          errorType: classifyError(error),
        });
        showToast({ kind: "error", message: "Could not update token." });
      } finally {
        setUpdatingCredentialId(null);
      }
    },
    [updateCredential, showToast],
  );

  const handleRenameCredential = useCallback(
    async (credentialId: Id<"automationCredentials">, label: string) => {
      const trimmed = label.trim();
      if (!trimmed) {
        showToast({ kind: "error", message: "Enter a token name." });
        return;
      }
      setUpdatingCredentialId(credentialId);
      try {
        await updateCredential({ credentialId, label: trimmed });
      } catch (error) {
        mobileLogger.warn("automation_credential_rename_failed", {
          errorType: classifyError(error),
        });
        showToast({ kind: "error", message: "Could not rename token." });
      } finally {
        setUpdatingCredentialId(null);
      }
    },
    [updateCredential, showToast],
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
  const HeaderMarkIcon =
    navigation.screen === "detail"
      ? SETTINGS_CATEGORY_ICONS[navigation.category]
      : SettingsHomeIcon;

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
              {HeaderMarkIcon ? (
                <HeaderMarkIcon color={colors.textSecondary} size={22} />
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
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: bottomInset + spacing.lg },
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
                onKairoFieldFocus: handleKairoFieldFocus,
                automationCredentials,
                issuedBootstrapToken,
                pendingBootstrapTokens,
                isIssuingBootstrapToken,
                isLoadingCredentials,
                onIssueBootstrapToken: () => void handleIssueBootstrapToken(),
                onDismissIssuedToken: handleDismissIssuedToken,
                onCancelBootstrapToken: (bootstrapTokenId) =>
                  handleCancelBootstrapToken(bootstrapTokenId),
                cancellingBootstrapTokenId,
                onCopy: handleCopy,
                onRevokeCredential: (credentialId) => handleRevokeCredential(credentialId),
                revokingCredentialId,
                onDeleteCredential: (credentialId) => handleDeleteCredential(credentialId),
                deletingCredentialId,
                onSetTaskWrites: (credentialId, allow) =>
                  handleSetTaskWrites(credentialId, allow),
                onRenameCredential: (credentialId, label) =>
                  handleRenameCredential(credentialId, label),
                updatingCredentialId,
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
  summaryKickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
    minWidth: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  copyButtonText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  copyButtonDone: {
    backgroundColor: colors.successMuted,
    borderColor: colors.successMuted,
  },
  copyButtonTextDone: {
    color: colors.success,
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
  credentialHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  credentialLabel: {
    flexShrink: 1,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: 7,
  },
  statusBadgeActive: {
    backgroundColor: colors.successMuted,
  },
  statusBadgeIdle: {
    backgroundColor: "rgba(91,80,72,0.05)",
  },
  statusBadgeError: {
    backgroundColor: colors.errorMuted,
  },
  statusBadgeWarning: {
    backgroundColor: colors.warningMuted,
  },
  statusBadgeText: {
    ...typography.bodyMd,
    fontFamily: "Geist_500Medium",
  },
  statusBadgeTextActive: {
    color: colors.success,
  },
  statusBadgeTextIdle: {
    color: colors.textSecondary,
  },
  statusBadgeTextError: {
    color: colors.error,
  },
  statusBadgeTextWarning: {
    color: colors.warning,
  },
  syncIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  syncTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  syncErrorCallout: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.errorMuted,
  },
  syncErrorText: {
    ...typography.bodyMd,
    color: colors.error,
    flex: 1,
    lineHeight: 18,
  },
  syncHintRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingTop: 1,
  },
  syncHintText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    flex: 1,
    lineHeight: 18,
    marginTop: -2,
  },
  syncActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    marginTop: spacing.xs,
  },
  syncActionButtonDisabled: {
    opacity: 0.6,
  },
  syncActionText: {
    ...typography.bodyMd,
    fontFamily: "Geist_600SemiBold",
    color: colors.textPrimary,
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
  issuedCard: {
    gap: spacing.md,
  },
  issuedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  issuedExpiry: {
    ...typography.numeric,
    color: colors.textDim,
  },
  issuedExpiryExpired: {
    color: colors.error,
  },
  issuedHint: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 18,
  },
  issuedHintMono: {
    ...typography.numeric,
    color: colors.textSecondary,
  },
  issuedDoneButton: {
    alignSelf: "flex-end",
  },
  pendingMeta: {
    ...typography.numeric,
    color: colors.textMuted,
  },
  codePillMuted: {
    opacity: 0.55,
  },
  tokenMono: {
    ...typography.numeric,
    color: colors.textPrimary,
  },
  tokenMonoMuted: {
    color: colors.textDim,
  },
  tokensHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  newTokenChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  newTokenChipText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  tokenList: {
    marginTop: spacing.xs,
  },
  tokenDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.bgInput,
  },
  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  tokenIconTile: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  tokenRowCopy: {
    flex: 1,
    gap: 6,
  },
  tokenRowTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  tokenName: {
    ...typography.bodyLg,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
    flexShrink: 1,
  },
  tokenSubtitle: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  rowChevron: {
    alignItems: "center",
    justifyContent: "center",
  },
  rowChevronExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  tokenPanel: {
    gap: spacing.md,
    marginTop: spacing.xs,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
  },
  renameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  renameInput: {
    flex: 1,
  },
  tokenActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  ghostButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  ghostButtonText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    fontFamily: "Geist_500Medium",
  },
  confirmBackdrop: {
    flex: 1,
    backgroundColor: colors.backdrop,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  confirmCard: {
    alignSelf: "stretch",
    backgroundColor: colors.bgFloating,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  confirmTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  confirmMessage: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  confirmActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  confirmDestructiveButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.error,
  },
  confirmDestructiveText: {
    ...typography.bodyMd,
    color: colors.textInverse,
    fontFamily: "Geist_600SemiBold",
  },
  revokeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.errorMuted,
  },
  revokeButtonText: {
    ...typography.bodyMd,
    color: colors.error,
    fontFamily: "Geist_600SemiBold",
  },
  emptyCard: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
  },
  emptyIconTile: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.xs,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  emptyHelp: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: spacing.md,
    alignSelf: "stretch",
    minHeight: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.bgInput,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    ...typography.bodyLg,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  behaviorStack: {
    gap: spacing.sm,
  },
  segmentedTrack: {
    flexDirection: "row",
    padding: SEGMENT_TRACK_PADDING,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  segmentedThumb: {
    position: "absolute",
    top: SEGMENT_TRACK_PADDING,
    bottom: SEGMENT_TRACK_PADDING,
    left: SEGMENT_TRACK_PADDING,
    borderRadius: radii.md - SEGMENT_TRACK_PADDING,
    backgroundColor: colors.textPrimary,
  },
  segmentedOption: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.sm,
  },
  segmentedOptionText: {
    ...typography.bodyMd,
    fontFamily: "Geist_500Medium",
  },
  timeInlineButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
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
