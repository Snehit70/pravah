export type SettingsCategoryKey =
  | "assistantAutomation"
  | "sync"
  | "reminders"
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
  "assistantAutomation",
  "sync",
  "reminders",
  "appearance",
  "about",
];

export const SETTINGS_CATEGORY_META: Record<
  SettingsCategoryKey,
  { title: string; summary: string }
> = {
  assistantAutomation: {
    title: "Assistant & Automation",
    summary: "Kairo settings, starter pills, bootstrap tokens, and issued credentials.",
  },
  sync: {
    title: "Sync",
    summary: "Google Calendar health, Gmail review, and connected account state.",
  },
  reminders: {
    title: "Reminders",
    summary: "Notifications, morning digest, lead time, and quiet hours.",
  },
  appearance: {
    title: "Appearance",
    summary: "Density, motion, tab order, and bulk capture preferences.",
  },
  about: {
    title: "About",
    summary: "Version info, exports, diagnostics, account actions, and support links.",
  },
};

export const SETTINGS_CATEGORY_CONTROLS: Record<
  SettingsCategoryKey,
  readonly string[]
> = {
  assistantAutomation: [
    "kairo_config",
    "kairo_starter_pills",
    "automation_bootstrap_token",
    "automation_credentials",
  ],
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
  appearance: [
    "reduced_motion",
    "density",
    "tab_order",
    "bulk_task_capture",
  ],
  about: [
    "app_version",
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
