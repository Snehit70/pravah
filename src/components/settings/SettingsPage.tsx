// Settings — a full workspace page, web-adapted from the mobile
// SettingsSheet: a category rail (the mobile home list, same nine sections,
// same icons and summaries) beside the selected section's detail cards.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "../../lib/data";
import { api } from "../../../convex/_generated/api";
import { tx } from "../../lib/motion";
import { cn } from "../../lib/utils";
import { authClient } from "../../lib/auth-client";
import {
  getKairoProviderLabel,
  getKairoSettings,
} from "../../lib/kairoConfig";
import { getGoogleTokens } from "../../lib/google/api";
import {
  ACCENT_OPTIONS,
  applyAccent,
  loadAccent,
  storeAccent,
  type WebAccent,
} from "../../lib/accent";
import { useToast } from "../useToast";
import { version as webVersion } from "../../../package.json";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  BellIcon,
} from "../ui/icons";
import {
  appSettingsIcon,
  settingsKairoIcon,
  settingsCliIcon,
  settingsSyncIcon,
  settingsRemindersIcon,
  settingsInteractionIcon,
  settingsAppearanceIcon,
  settingsDataIcon,
  settingsAboutIcon,
  aboutPravahMobileIcon,
  aboutGithubIcon,
  aboutReportIssueIcon,
  appearanceThemeWarmIcon,
  appearanceThemeSystemIcon,
  appearanceThemeDarkIcon,
  interactionReducedMotionIcon,
  dataExportTasksIcon,
  dataDiagnosticsIcon,
  providerGoogleIcon,
} from "../ui/traced-icons";

const ThemeSystemIcon = appearanceThemeSystemIcon;
const ReportIssueIcon = aboutReportIssueIcon;
const GithubIcon = aboutGithubIcon;

const ReducedMotionIcon = interactionReducedMotionIcon;
const ExportTasksIcon = dataExportTasksIcon;
const DiagnosticsIcon = dataDiagnosticsIcon;
const GoogleAccountIcon = providerGoogleIcon;
import {
  SettingsCard,
  SettingRow,
  StatusBadge,
  SettingsButton,
  IconTile,
  WarmToggle,
  type StatusTone,
} from "./primitives";
import { KairoSettingsSection } from "./KairoSettingsSection";
import { AccessTokensSection } from "./AccessTokensSection";
import { SyncSettingsSection } from "./SyncSettingsSection";

const AppSettingsMark = appSettingsIcon;
const KairoMarkIcon = settingsKairoIcon;
const CliMarkIcon = settingsCliIcon;
const SyncMarkIcon = settingsSyncIcon;
const RemindersMarkIcon = settingsRemindersIcon;
const InteractionMarkIcon = settingsInteractionIcon;
const AppearanceMarkIcon = settingsAppearanceIcon;
const DataMarkIcon = settingsDataIcon;
const AboutMarkIcon = settingsAboutIcon;
const AccountMarkIcon = aboutPravahMobileIcon;

export type SettingsCategory =
  | "kairo"
  | "cli"
  | "sync"
  | "reminders"
  | "interaction"
  | "appearance"
  | "data"
  | "account"
  | "about";

const SETTINGS_CATEGORY_ORDER: SettingsCategory[] = [
  "kairo",
  "cli",
  "sync",
  "reminders",
  "interaction",
  "appearance",
  "data",
  "account",
  "about",
];

const SETTINGS_CATEGORY_META: Record<
  SettingsCategory,
  { title: string; summary: string; icon: typeof KairoMarkIcon }
> = {
  kairo: { title: "Kairo", summary: "Provider and behavior", icon: KairoMarkIcon },
  cli: { title: "Access tokens", summary: "Short-lived tokens for the pravah CLI", icon: CliMarkIcon },
  sync: { title: "Sync", summary: "Data sync and accounts", icon: SyncMarkIcon },
  reminders: { title: "Reminders", summary: "Browser notifications", icon: RemindersMarkIcon },
  interaction: { title: "Interaction", summary: "Motion and feedback", icon: InteractionMarkIcon },
  appearance: { title: "Appearance", summary: "Accent and display", icon: AppearanceMarkIcon },
  data: { title: "Data & diagnostics", summary: "Exports and workspace data", icon: DataMarkIcon },
  account: { title: "Account", summary: "Switch account or sign out", icon: AccountMarkIcon },
  about: { title: "About", summary: "Version and updates", icon: AboutMarkIcon },
};

const REDUCED_MOTION_KEY = "pravah:web-reduced-motion";
const NOTIFICATIONS_KEY = "pravah:web-notifications";

function readStoredBoolean(key: string): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(key) === "1";
}

interface SettingsPageProps {
  initialCategory?: SettingsCategory;
  /** Bumped by deep links (e.g. Kairo's setup banner) so re-opening the same
      category re-selects it even when it didn't change. */
  seedNonce?: number;
  onBack: () => void;
}

export function SettingsPage({
  initialCategory = "kairo",
  seedNonce = 0,
  onBack,
}: SettingsPageProps) {
  const [category, setCategory] = useState<SettingsCategory>(initialCategory);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory, seedNonce]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  // Statuses for the category rail. Query results are shared with the
  // sections by Convex; the localStorage ones re-read on category change.
  const kairoStatus = useMemo(() => {
    const settings = getKairoSettings();
    const profile = settings.profiles[settings.defaultProvider];
    const configured = Boolean(
      profile.apiKey.trim() && profile.baseUrl.trim() && profile.model.trim()
    );
    return configured
      ? { label: getKairoProviderLabel(settings.defaultProvider), tone: "success" as StatusTone }
      : { label: "Not set", tone: "warning" as StatusTone };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derive on category switch: localStorage has no subscription
  }, [category]);
  const credentials = useQuery(api.automation.listCredentials, {}) ?? [];
  const activeCredentials = credentials.filter((c) => c.status === "active").length;
  const currentUser = useQuery(api.auth.getCurrentUser, {});
  const [accent, setAccentState] = useState<WebAccent>(() => loadAccent());
  const googleConnected = useMemo(() => {
    // Cheap, reactive-enough for the rail: read the same token store the
    // SyncSettingsSection uses.
    const tokens = getGoogleTokens();
    return Boolean(tokens && !tokens.expired);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-derive on category switch: localStorage has no subscription
  }, [category]);

  const statuses: Record<SettingsCategory, { label: string; tone: StatusTone }> = {
    kairo: kairoStatus,
    cli:
      activeCredentials > 0
        ? { label: `${activeCredentials} active`, tone: "success" }
        : { label: "Not issued", tone: "idle" },
    sync: googleConnected
      ? { label: "Connected", tone: "success" }
      : { label: "Off", tone: "idle" },
    reminders: readStoredBoolean(NOTIFICATIONS_KEY)
      ? { label: "On", tone: "success" }
      : { label: "Off", tone: "idle" },
    interaction: readStoredBoolean(REDUCED_MOTION_KEY)
      ? { label: "Reduced", tone: "success" }
      : { label: "Full", tone: "idle" },
    appearance: {
      label: ACCENT_OPTIONS.find((a) => a.value === accent)?.label ?? "Purple",
      tone: "idle",
    },
    data: { label: "Ready", tone: "idle" },
    account: { label: currentUser?.email ?? "Signed in", tone: "idle" },
    about: { label: `v${webVersion}`, tone: "idle" },
  };

  return (
    <div className="h-full overflow-y-auto" data-testid="settings-page">
      <div className="mx-auto w-full px-7 py-6" style={{ maxWidth: 1120 }}>
        {/* Page header */}
        <div className="mb-5 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to workspace"
            title="Back"
            className="grid place-items-center cursor-pointer rounded-[10px]"
            style={{
              width: 36,
              height: 36,
              background: "var(--color-bg-surface)",
              border: "1px solid var(--color-border-default)",
              color: "var(--color-text-muted)",
              transition: tx(["color", "border-color"], "instant"),
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--color-text-primary)";
              e.currentTarget.style.borderColor = "var(--color-border-strong)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--color-text-muted)";
              e.currentTarget.style.borderColor = "var(--color-border-default)";
            }}
          >
            <ChevronLeftIcon size={17} strokeWidth={1.8} />
          </button>
          <div className="min-w-0">
            <h1
              className="text-ink"
              style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3, lineHeight: 1.2 }}
            >
              Settings
            </h1>
            <p
              className="uppercase"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                letterSpacing: "0.14em",
                color: "var(--color-text-dim)",
              }}
            >
              Personal workspace · web v{webVersion}
            </p>
          </div>
          <div className="flex-1" />
          <span
            className="grid place-items-center"
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "var(--color-accent-dim)",
              border: "1px solid var(--color-border-subtle)",
              color: "var(--color-accent-primary)",
            }}
          >
            <AppSettingsMark size={18} />
          </span>
        </div>

        {/* Category rail + detail */}
        <div className="grid items-start gap-4" style={{ gridTemplateColumns: "288px minmax(0, 1fr)" }}>
          <nav
            aria-label="Settings categories"
            className="overflow-hidden"
            style={{
              background: "var(--color-bg-elevated)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: 14,
            }}
          >
            {SETTINGS_CATEGORY_ORDER.map((key, index) => {
              const meta = SETTINGS_CATEGORY_META[key];
              const status = statuses[key];
              const Icon = meta.icon;
              const selected = category === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCategory(key)}
                  aria-current={selected ? "true" : undefined}
                  aria-label={`Open ${meta.title} settings`}
                  className={cn(
                    "relative flex w-full items-center gap-3 text-left cursor-pointer",
                    "min-h-[64px]"
                  )}
                  style={{
                    padding: "10px 14px 10px 18px",
                    borderTop: index > 0 ? "1px solid var(--color-fill-soft)" : "none",
                    background: selected ? "var(--color-fill-soft)" : "transparent",
                    transition: "background-color var(--dur-instant) var(--ease-out-expo)",
                  }}
                  onMouseEnter={(e) => {
                    if (!selected) e.currentTarget.style.background = "var(--color-fill-faint)";
                  }}
                  onMouseLeave={(e) => {
                    if (!selected) e.currentTarget.style.background = "transparent";
                  }}
                >
                  {selected && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-[10px] bottom-[10px]"
                      style={{
                        width: 2.5,
                        borderRadius: 99,
                        background: "var(--color-accent-primary)",
                      }}
                    />
                  )}
                  <IconTile size={34}>
                    <Icon size={18} />
                  </IconTile>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-ink leading-tight">
                      {meta.title}
                    </span>
                    <span className="block text-[11.5px] text-ink-mute truncate leading-tight mt-0.5">
                      {meta.summary}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 shrink-0">
                    <span
                      className="text-[11.5px] font-medium max-w-[92px] truncate"
                      style={{ color: statusToneColor(status.tone) }}
                    >
                      {status.label}
                    </span>
                    <ChevronRightIcon size={14} className="text-ink-dim" />
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 space-y-4">
            {/* Section header */}
            <div className="flex items-center gap-3 px-1">
              <IconTile>
                {(() => {
                  const Icon = SETTINGS_CATEGORY_META[category].icon;
                  return <Icon size={18} />;
                })()}
              </IconTile>
              <div>
                <h2
                  className="text-ink"
                  style={{ fontSize: 16, fontWeight: 600, letterSpacing: -0.2, lineHeight: 1.25 }}
                >
                  {SETTINGS_CATEGORY_META[category].title}
                </h2>
                <p className="text-[12px] text-ink-mute">
                  {SETTINGS_CATEGORY_META[category].summary}
                </p>
              </div>
            </div>

            {category === "kairo" && <KairoSettingsSection />}
            {category === "cli" && <AccessTokensSection />}
            {category === "sync" && <SyncSettingsSection />}
            {category === "reminders" && <RemindersSection />}
            {category === "interaction" && <InteractionSection />}
            {category === "appearance" && (
              <AppearanceSection accent={accent} onChangeAccent={setAccentState} />
            )}
            {category === "data" && <DataSection />}
            {category === "account" && <AccountSection />}
            {category === "about" && <AboutSection />}
          </div>
        </div>
      </div>
    </div>
  );
}

function statusToneColor(tone: StatusTone): string {
  return tone === "success"
    ? "var(--color-success)"
    : tone === "warning"
      ? "var(--color-warning)"
      : tone === "error"
        ? "var(--color-error)"
        : "var(--color-text-secondary)";
}

function RemindersSection() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(() =>
    readStoredBoolean(NOTIFICATIONS_KEY)
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      setNotificationsEnabled(true);
      localStorage.setItem(NOTIFICATIONS_KEY, "1");
    }
  };

  const sendTestNotification = () => {
    if (notificationPermission !== "granted" || !notificationsEnabled) return;
    new Notification("Pravah reminders are ready", {
      body: "Browser notifications are connected to this workspace.",
    });
  };

  const tone: StatusTone =
    notificationPermission === "unsupported"
      ? "idle"
      : notificationPermission === "granted"
        ? "success"
        : notificationPermission === "denied"
          ? "error"
          : "warning";

  return (
    <SettingsCard>
      <div className="flex items-start justify-between gap-4">
        <SettingRow
          icon={<BellIcon size={17} />}
          title="Notification permission"
          help={
            notificationPermission === "unsupported"
              ? "This browser does not support notifications."
              : notificationPermission === "granted"
                ? "Allowed for this browser."
                : notificationPermission === "denied"
                  ? "Blocked by the browser. Change it in site permissions."
                  : "Permission is requested only when you choose it."
          }
        />
        <div className="flex items-center gap-2">
          <StatusBadge
            tone={tone}
            label={
              notificationPermission === "unsupported"
                ? "Unavailable"
                : notificationPermission === "granted"
                  ? "Ready"
                  : notificationPermission === "denied"
                    ? "Blocked"
                    : "Permission needed"
            }
          />
          {notificationPermission !== "granted" && notificationPermission !== "unsupported" && (
            <SettingsButton variant="soft" onClick={() => void requestNotifications()}>
              Allow
            </SettingsButton>
          )}
        </div>
      </div>
      {notificationPermission === "granted" && (
        <div
          className="flex items-center justify-between gap-3"
          style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12 }}
        >
          <SettingRow
            title="Browser reminders"
            help="Nudge this browser when a task is due soon."
          />
          <div className="flex items-center gap-2.5">
            <WarmToggle
              checked={notificationsEnabled}
              onChange={(next) => {
                setNotificationsEnabled(next);
                localStorage.setItem(NOTIFICATIONS_KEY, next ? "1" : "0");
              }}
              label="Enable browser reminders"
            />
            <SettingsButton
              variant="soft"
              onClick={sendTestNotification}
              disabled={!notificationsEnabled}
            >
              Send test
            </SettingsButton>
          </div>
        </div>
      )}
    </SettingsCard>
  );
}

function InteractionSection() {
  const [reducedMotion, setReducedMotion] = useState(() => readStoredBoolean(REDUCED_MOTION_KEY));

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? "1" : "0";
    localStorage.setItem(REDUCED_MOTION_KEY, reducedMotion ? "1" : "0");
  }, [reducedMotion]);

  return (
    <SettingsCard>
      <div className="flex items-center justify-between gap-4">
        <SettingRow
          icon={<ReducedMotionIcon size={17} />}
          title="Reduced motion"
          help="Keep transitions calm on this browser."
        />
        <WarmToggle
          checked={reducedMotion}
          onChange={setReducedMotion}
          label="Reduced motion"
        />
      </div>
    </SettingsCard>
  );
}

function AppearanceSection({
  accent,
  onChangeAccent,
}: {
  accent: WebAccent;
  onChangeAccent: (accent: WebAccent) => void;
}) {
  const pick = (value: WebAccent) => {
    onChangeAccent(value);
    applyAccent(value);
    storeAccent(value);
  };

  return (
    <div className="space-y-4">
      <SettingsCard>
        <SettingRow
          title="App accent"
          help="One hue across the workspace — timeline, goals, insights, and Kairo follow along."
        />
        <div className="flex flex-wrap gap-2.5 pt-1">
          {ACCENT_OPTIONS.map((option) => {
            const active = accent === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => pick(option.value)}
                aria-pressed={active}
                className="flex items-center gap-2.5 cursor-pointer"
                style={{
                  padding: "7px 12px 7px 8px",
                  borderRadius: 10,
                  background: active ? "var(--color-accent-dim)" : "var(--color-bg-surface)",
                  border: `1px solid ${active ? option.dot : "var(--color-border-default)"}`,
                  transition: "border-color var(--dur-fast) var(--ease-out-expo), background-color var(--dur-fast) var(--ease-out-expo)",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 7,
                    background: option.dot,
                    boxShadow: "inset 0 0 0 1px rgba(44, 33, 24, 0.12)",
                  }}
                />
                <span
                  className="text-[12.5px]"
                  style={{
                    fontWeight: active ? 600 : 500,
                    color: active ? "var(--color-accent-primary)" : "var(--color-text-secondary)",
                  }}
                >
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsCard>

      <SettingsCard>
        <SettingRow
          icon={<ThemeSystemIcon size={17} />}
          title="Theme"
          help="Warm light is the web baseline for now; the full dark surface ships with the mobile theme engine."
        />
        <div
          className="grid grid-cols-3 gap-2"
          style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12 }}
        >
          {[
            { icon: appearanceThemeWarmIcon, label: "Warm light", active: true },
            { icon: appearanceThemeSystemIcon, label: "System", active: false },
            { icon: appearanceThemeDarkIcon, label: "Dark", active: false },
          ].map(({ icon: ThemeIcon, label, active }) => (
            <div
              key={label}
              aria-hidden
              className="flex items-center gap-2.5 justify-center"
              style={{
                padding: "9px 10px",
                borderRadius: 10,
                background: active ? "var(--color-fill-soft)" : "var(--color-fill-faint)",
                border: `1px solid ${active ? "var(--color-border-strong)" : "var(--color-border-subtle)"}`,
                color: active ? "var(--color-text-primary)" : "var(--color-text-dim)",
              }}
            >
              <ThemeIcon size={16} />
              <span className="text-[12px] font-medium">{label}</span>
              {!active && (
                <span
                  className="uppercase"
                  style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: "0.1em" }}
                >
                  Soon
                </span>
              )}
            </div>
          ))}
        </div>
      </SettingsCard>
    </div>
  );
}

function DataSection() {
  // Mount these subscriptions only in Data settings. Board data deliberately
  // omits history and must never be used as the source of a workspace export.
  const tasks = useQuery(api.tasks.listTasks, {});
  const goals = useQuery(api.goals.list, {});
  const goalLinks = useQuery(api.goals.listLinks, {});
  const ready = tasks !== undefined && goals !== undefined && goalLinks !== undefined;
  const exportTasks = () => {
    if (!ready) return;
    const payload = JSON.stringify(
      { schemaVersion: 1, exportedAt: new Date().toISOString(), tasks, goals, goalLinks },
      null,
      2
    );
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pravah-tasks-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <SettingsCard>
      <div className="flex items-center justify-between gap-4">
        <SettingRow
          icon={<ExportTasksIcon size={17} />}
          title="Export tasks"
          help="Download all active and completed tasks, goals, and goal links as JSON. Images and cancelled tasks are not included."
        />
        <SettingsButton variant="soft" onClick={exportTasks} disabled={!ready}>
          {ready ? "Export" : "Loading export…"}
        </SettingsButton>
      </div>
      <div
        className="flex items-center justify-between gap-4"
        style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12 }}
      >
        <SettingRow
          icon={<DiagnosticsIcon size={17} />}
          title="Sync diagnostics"
          help="Convex sync runs live in this workspace; the status bar on the timeline shows the latest connection."
        />
        <StatusBadge tone="success" label="Live" />
      </div>
    </SettingsCard>
  );
}

function AccountSection() {
  const currentUser = useQuery(api.auth.getCurrentUser, {});
  const [signingOut, setSigningOut] = useState(false);
  const { showError, showSuccess } = useToast();

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      showSuccess("Signed out successfully");
    } catch (error) {
      console.error("Sign out failed", error);
      showError("Failed to sign out. Please try again.");
      setSigningOut(false);
    }
  };

  return (
    <SettingsCard>
      <div className="flex items-center justify-between gap-4">
        <SettingRow
          icon={<GoogleAccountIcon size={17} />}
          title={currentUser?.email ?? currentUser?.name ?? "Signed in"}
          help="This is your only app login. Google sync permissions are managed under Sync."
        />
        <SettingsButton variant="dangerGhost" onClick={() => void handleSignOut()} disabled={signingOut}>
          {signingOut ? "Signing out…" : "Sign out"}
        </SettingsButton>
      </div>
    </SettingsCard>
  );
}

function AboutSection() {
  return (
    <div className="space-y-4">
      <SettingsCard>
        <div className="flex items-center gap-3">
          <IconTile tone="accent">
            <AboutMarkIcon size={18} />
          </IconTile>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">Pravah Web</p>
            <p className="text-[12px] text-ink-mute">
              Installed v{webVersion} · the timeline-first personal workspace
            </p>
          </div>
          <StatusBadge tone="success" label="Up to date" />
        </div>
      </SettingsCard>

      <SettingsCard>
        <a
          href="https://github.com/Snehit70/pravah/issues"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 no-underline"
          style={{ color: "inherit" }}
        >
          <IconTile>
            <ReportIssueIcon size={17} />
          </IconTile>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-ink">Report an issue</span>
            <span className="block text-[12px] text-ink-mute">
              Something look off? Open a GitHub issue.
            </span>
          </span>
          <ExternalArrow />
        </a>
        <a
          href="https://github.com/Snehit70/pravah"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-3 no-underline"
          style={{ color: "inherit", borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12 }}
        >
          <IconTile>
            <GithubIcon size={17} />
          </IconTile>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-ink">GitHub repository</span>
            <span className="block text-[12px] text-ink-mute">Snehit70/pravah</span>
          </span>
          <ExternalArrow />
        </a>
      </SettingsCard>
    </div>
  );
}

function ExternalArrow() {
  return (
    <span aria-hidden className="text-ink-dim" style={{ display: "inline-flex" }}>
      <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
        <path
          d="M7 17 17 7M9 7h8v8"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
