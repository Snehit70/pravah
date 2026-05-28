/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearKairoConfig,
  getKairoConfig,
  getKairoSettings,
  saveKairoSettings,
} from "../lib/kairoConfig";

describe("kairoConfig", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("migrates legacy single-provider keys into profile settings", () => {
    localStorage.setItem("pravah:kairo-provider-format", "anthropic");
    localStorage.setItem("pravah:kairo-api-key", "legacy-key");
    localStorage.setItem("pravah:kairo-base-url", "https://api.anthropic.com/v1/messages");
    localStorage.setItem("pravah:kairo-model", "claude-test");

    const settings = getKairoSettings();
    expect(settings.defaultProvider).toBe("anthropic");
    expect(settings.profiles.anthropic.apiKey).toBe("legacy-key");
    expect(settings.profiles.anthropic.model).toBe("claude-test");
  });

  it("persists default provider and returns active config", () => {
    const settings = getKairoSettings();
    saveKairoSettings({
      ...settings,
      defaultProvider: "gemini",
      profiles: {
        ...settings.profiles,
        gemini: {
          apiKey: "gem-key",
          baseUrl: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
          model: "gemini-2.5-flash",
        },
      },
    });

    const active = getKairoConfig();
    expect(active.providerFormat).toBe("gemini");
    expect(active.apiKey).toBe("gem-key");
    expect(active.model).toBe("gemini-2.5-flash");
  });

  it("clears both legacy and v2 storage keys", () => {
    const settings = getKairoSettings();
    saveKairoSettings(settings);
    clearKairoConfig();
    expect(localStorage.getItem("pravah:kairo-settings-v2")).toBeNull();
    expect(localStorage.getItem("pravah:kairo-provider-format")).toBeNull();
    expect(localStorage.getItem("pravah:kairo-api-key")).toBeNull();
  });
});
