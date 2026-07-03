export type SettingsCategoryKey =
  | "kairo"
  | "cli"
  | "sync"
  | "reminders"
  | "interaction"
  | "appearance"
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
  about: {
    title: "About",
    summary: "Version and diagnostics",
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
  about: [
    "app_version",
    "app_update_check",
    "support_links",
    "export_tasks",
    "export_diagnostics",
    "sync_errors",
    "retry_queue",
    "sign_out",
    "wipe_local_data",
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
