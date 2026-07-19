export type SettingsCategoryKey =
  | "kairo"
  | "cli"
  | "sync"
  | "reminders"
  | "interaction"
  | "appearance"
  | "data"
  | "account"
  | "about";

export type SettingsNavigationState =
  | { screen: "list" }
  | { screen: "detail"; category: SettingsCategoryKey };

export type SettingsNavigationAction =
  | { type: "open"; category: SettingsCategoryKey }
  | { type: "back" }
  | { type: "reset" };

export const SETTINGS_CATEGORY_ORDER: readonly SettingsCategoryKey[] = [
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

export const SETTINGS_CATEGORY_META: Record<
  SettingsCategoryKey,
  { title: string; summary: string }
> = {
  kairo: {
    title: "Kairo",
    summary: "Provider and behavior",
  },
  cli: {
    title: "Access tokens",
    summary: "Short-lived tokens for the pravah CLI",
  },
  sync: {
    title: "Sync",
    summary: "Data sync and accounts",
  },
  reminders: {
    title: "Reminders",
    summary: "Notifications and reminders",
  },
  interaction: {
    title: "Interaction",
    summary: "Gestures and feedback",
  },
  appearance: {
    title: "Appearance",
    summary: "Theme and display",
  },
  data: {
    title: "Data & diagnostics",
    summary: "Exports, retry queue, reset",
  },
  account: {
    title: "Account",
    summary: "Sign out and account",
  },
  about: {
    title: "About",
    summary: "Version and updates",
  },
};

export const SETTINGS_CATEGORY_CONTROLS: Record<
  SettingsCategoryKey,
  readonly string[]
> = {
  kairo: ["kairo_config", "kairo_starter_pills"],
  cli: ["automation_bootstrap_token", "automation_credentials"],
  sync: [
    "google_calendar_sync",
    "gmail_review",
    "sync_errors",
  ],
  reminders: [
    "notification_permissions",
    "test_notification",
    "morning_digest_time",
    "reminder_lead_time",
    "quiet_hours",
  ],
  interaction: [
    "bulk_task_capture",
    "swipe_actions",
    "haptics",
    "sound",
    "reduced_motion",
  ],
  appearance: [
    "theme_baseline",
    "font_baseline",
    "density",
    "task_color_scheme",
    "tab_order",
  ],
  data: [
    "export_tasks",
    "export_diagnostics",
    "retry_queue",
    "wipe_local_data",
  ],
  account: [
    "sign_out",
  ],
  about: [
    "app_version",
    "app_update_check",
    "support_links",
  ],
};

export const INITIAL_SETTINGS_NAVIGATION: SettingsNavigationState = { screen: "list" };

export function settingsNavigationReducer(
  state: SettingsNavigationState,
  action: SettingsNavigationAction,
): SettingsNavigationState {
  switch (action.type) {
    case "open":
      return { screen: "detail", category: action.category };
    case "back":
      return state.screen === "list" ? state : INITIAL_SETTINGS_NAVIGATION;
    case "reset":
      return INITIAL_SETTINGS_NAVIGATION;
  }
}
