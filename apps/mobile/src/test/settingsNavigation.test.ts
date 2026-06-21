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
  it("maps the Lean 5 categories to the expected control groups", () => {
    expect(SETTINGS_CATEGORY_CONTROLS.assistantAutomation).toEqual(
      expect.arrayContaining([
        "kairo_starter_pills",
        "automation_bootstrap_token",
        "automation_credentials",
      ]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.sync).toEqual(
      expect.arrayContaining(["google_calendar_sync", "gmail_review"]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.reminders).toEqual(
      expect.arrayContaining([
        "morning_digest_time",
        "reminder_lead_time",
        "quiet_hours",
      ]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.appearance).toEqual(
      expect.arrayContaining([
        "reduced_motion",
        "density",
        "tab_order",
        "bulk_task_capture",
        "hide_goal_linked_inbox",
      ]),
    );
    expect(SETTINGS_CATEGORY_CONTROLS.about).toEqual(
      expect.arrayContaining(["app_version", "sign_out", "support_links"]),
    );
  });
});
