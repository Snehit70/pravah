import { describe, expect, it } from "vitest";

import {
  INITIAL_SETTINGS_NAVIGATION,
  SETTINGS_CATEGORY_CONTROLS,
  settingsNavigationReducer,
} from "../lib/settingsNavigation";

describe("settingsNavigationReducer", () => {
  it("opens a category detail screen from the list", () => {
    expect(
      settingsNavigationReducer(INITIAL_SETTINGS_NAVIGATION, {
        type: "open",
        category: "appearance",
      }),
    ).toEqual({
      screen: "detail",
      category: "appearance",
    });
  });

  it("opens the What's new page from About", () => {
    expect(
      settingsNavigationReducer(
        { screen: "detail", category: "about" },
        { type: "openWhatsNew" },
      ),
    ).toEqual({
      screen: "detail",
      category: "about",
      page: "whats-new",
    });
  });

  it("returns to About from the What's new page", () => {
    expect(
      settingsNavigationReducer(
        { screen: "detail", category: "about", page: "whats-new" },
        { type: "back" },
      ),
    ).toEqual({ screen: "detail", category: "about" });
  });

  it("returns to the category list from a detail screen", () => {
    expect(
      settingsNavigationReducer(
        { screen: "detail", category: "sync" },
        { type: "back" },
      ),
    ).toEqual(INITIAL_SETTINGS_NAVIGATION);
  });

  it("treats back from the list as a no-op", () => {
    expect(
      settingsNavigationReducer(INITIAL_SETTINGS_NAVIGATION, { type: "back" }),
    ).toEqual(INITIAL_SETTINGS_NAVIGATION);
  });

  it("resets to the list from any screen", () => {
    expect(
      settingsNavigationReducer(
        { screen: "detail", category: "about" },
        { type: "reset" },
      ),
    ).toEqual(INITIAL_SETTINGS_NAVIGATION);
  });
});

describe("SETTINGS_CATEGORY_CONTROLS", () => {
  it("maps the redesign categories to the expected control groups", () => {
    expect(SETTINGS_CATEGORY_CONTROLS.kairo).toEqual(
      expect.arrayContaining(["kairo_config", "kairo_starter_pills"]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.cli).toEqual(
      expect.arrayContaining([
        "automation_bootstrap_token",
        "automation_credentials",
      ]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.sync).toEqual(
      expect.arrayContaining([
        "google_calendar_sync",
        "gmail_review",
        "sync_errors",
      ]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.account).toEqual(
      expect.arrayContaining(["sign_out"]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.reminders).toEqual(
      expect.arrayContaining([
        "morning_digest_time",
        "reminder_lead_time",
        "quiet_hours",
      ]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.interaction).toEqual(
      expect.arrayContaining([
        "bulk_task_capture",
        "hide_goal_linked_inbox_tasks",
        "swipe_actions",
        "haptics",
        "sound",
        "reduced_motion",
      ]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.appearance).toEqual(
      expect.arrayContaining([
        "theme_baseline",
        "font_baseline",
        "density",
        "tab_order",
      ]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.appearance).not.toContain("task_color_scheme");

    expect(SETTINGS_CATEGORY_CONTROLS.data).toEqual(
      expect.arrayContaining([
        "export_tasks",
        "export_diagnostics",
        "retry_queue",
        "wipe_local_data",
      ]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.about).toEqual(
      expect.arrayContaining(["app_version", "app_update_check", "support_links"]),
    );
  });
});
