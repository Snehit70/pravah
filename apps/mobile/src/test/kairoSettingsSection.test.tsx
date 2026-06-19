/** @vitest-environment happy-dom */
/**
 * KairoSettingsSection interaction tests
 *
 * Strategy: mock expo-secure-store so we can control what getKairoConfig()
 * resolves to, mock react-native with DOM equivalents so the component tree
 * can be rendered in happy-dom, and drive all assertions through
 * @testing-library/react queries.
 */

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── react-native mock ────────────────────────────────────────────────────────
vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  const View = ({ children, ...rest }: AnyProps) => {
    const { style: _, ...safe } = rest;
    return React.createElement("div", safe, children);
  };
  const Text = ({ children, ...rest }: AnyProps) => {
    const { style: _, ...safe } = rest;
    return React.createElement("span", safe, children);
  };
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const {
      onPress,
      style: _,
      hitSlop: __,
      disabled,
      accessibilityLabel,
      accessibilityRole: ___,
      ...safe
    } = rest as {
      onPress?: () => void;
      hitSlop?: unknown;
      disabled?: boolean;
      accessibilityLabel?: string;
      accessibilityRole?: string;
    } & AnyProps;
    const resolved =
      typeof children === "function"
        ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      { ...safe, onClick: onPress, type: "button", disabled: disabled ?? false, "aria-label": accessibilityLabel },
      resolved,
    );
  };
  const TextInput = ({
    value,
    onChangeText,
    placeholder,
    autoCapitalize: _autoCapitalize,
    autoCorrect: _autoCorrect,
    editable: _editable,
    placeholderTextColor: _placeholderTextColor,
    secureTextEntry: _secureTextEntry,
    style: _style,
    ...rest
  }: {
    value?: string;
    onChangeText?: (v: string) => void;
    placeholder?: string;
    [key: string]: unknown;
  }) =>
    React.createElement("input", {
      ...rest,
      value: value ?? "",
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChangeText?.(e.target.value),
      placeholder,
    });
  return {
    View,
    Text,
    TextInput,
    Pressable,
    StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1 },
  };
});

// ─── react-native-reanimated mock ─────────────────────────────────────────────
vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children?: React.ReactNode; [key: string]: unknown }) =>
      React.createElement("div", {}, children),
  },
  FadeIn: { duration: () => undefined },
  FadeOut: { duration: () => undefined },
}));

// ─── useReducedMotion mock ────────────────────────────────────────────────────
vi.mock("../hooks/useReducedMotion", () => ({ useReducedMotion: () => false }));

// ─── theme tokens mock ────────────────────────────────────────────────────────
vi.mock("../theme/tokens", () => ({
  colors: {
    primary: "#0f0",
    textMuted: "#999",
    accent: "#06f",
    error: "#f00",
    success: "#0a0",
    successMuted: "#afa",
    accentSoft: "#e0f",
    textPrimary: "#fff",
    textSecondary: "#ccc",
    bgCard: "#111",
    border: "#333",
  },
  radii: { md: 8, lg: 12, full: 9999 },
  spacing: { xs: 4, sm: 8, md: 16, lg: 24 },
  typography: { micro: {}, bodyMd: {}, title: {}, headline: {} },
}));

// ─── LoadingSkeleton mock ─────────────────────────────────────────────────────
vi.mock("../components/LoadingSkeleton", () => ({
  KairoSettingsSkeleton: () => React.createElement("div", { "data-testid": "kairo-skeleton" }),
}));

// ─── expo-secure-store mock ───────────────────────────────────────────────────
// We use mutable module-level spies so individual tests can override behaviour.
vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null as string | null),
  setItemAsync: vi.fn(async () => undefined as void),
  deleteItemAsync: vi.fn(async () => undefined as void),
}));

// Import the mocked module *after* vi.mock so we get the spy references.
import * as SecureStore from "expo-secure-store";

// Import component after all mocks are set up.
import { KairoSettingsSection } from "../components/KairoSettingsSection";

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Resolve all four SecureStore keys to null (no saved config). */
function useEmptyConfig() {
  vi.mocked(SecureStore.getItemAsync).mockResolvedValue(null);
  vi.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
}

/** Resolve config with a custom endpoint so hasCustomKairoEndpoint returns true. */
function useCustomEndpointConfig() {
  vi.mocked(SecureStore.getItemAsync).mockImplementation(async (key: string) => {
    const map: Record<string, string> = {
      pravah_kairo_api_key: "sk-test",
      pravah_kairo_base_url: "https://custom.example.com/v1/messages",
      pravah_kairo_model: "my-custom-model",
      pravah_kairo_provider_format: "anthropic",
    };
    return map[key] ?? null;
  });
  vi.mocked(SecureStore.setItemAsync).mockResolvedValue(undefined);
  vi.mocked(SecureStore.deleteItemAsync).mockResolvedValue(undefined);
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("KairoSettingsSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("does not depend on bottom-sheet internals inside Settings", () => {
    const source = readFileSync("src/components/KairoSettingsSection.tsx", "utf8");
    expect(source).not.toContain("@gorhom/bottom-sheet");
    expect(source).not.toContain("BottomSheetTextInput");
  });

  it("shows the loading skeleton while SecureStore resolves", () => {
    // Never resolve so we can inspect the in-progress loading state.
    vi.mocked(SecureStore.getItemAsync).mockReturnValue(new Promise(() => {}));

    render(<KairoSettingsSection />);

    expect(screen.getByTestId("kairo-skeleton")).toBeTruthy();
  });

  it("hides the advanced section by default on empty config", async () => {
    useEmptyConfig();

    render(<KairoSettingsSection />);

    await waitFor(() => expect(screen.queryByTestId("kairo-skeleton")).toBeNull());

    // Advanced fields should not be visible.
    expect(screen.queryByText("Endpoint URL")).toBeNull();
    expect(screen.queryByText("Model")).toBeNull();

    // The toggle button should be in the collapsed state.
    expect(screen.getByRole("button", { name: /show advanced kairo settings/i })).toBeTruthy();
  });

  it("shows advanced fields when the Advanced toggle is pressed", async () => {
    useEmptyConfig();

    render(<KairoSettingsSection />);

    await waitFor(() => expect(screen.queryByTestId("kairo-skeleton")).toBeNull());

    const toggleBtn = screen.getByRole("button", { name: /show advanced kairo settings/i });
    fireEvent.click(toggleBtn);

    expect(screen.getByText("Endpoint URL")).toBeTruthy();
    expect(screen.getByText("Model")).toBeTruthy();

    // Toggle should now offer "Hide".
    expect(screen.getByRole("button", { name: /hide advanced kairo settings/i })).toBeTruthy();
  });

  it("auto-opens advanced section on mount when config has a custom endpoint", async () => {
    useCustomEndpointConfig();

    render(<KairoSettingsSection />);

    await waitFor(() => expect(screen.queryByTestId("kairo-skeleton")).toBeNull());

    // Advanced section should be immediately visible — no user interaction needed.
    expect(screen.getByText("Endpoint URL")).toBeTruthy();
    expect(screen.getByText("Model")).toBeTruthy();
  });

  it("shows only the skeleton (no Save button) while loaded is false", () => {
    // Freeze the promise so loaded stays false.
    vi.mocked(SecureStore.getItemAsync).mockReturnValue(new Promise(() => {}));

    render(<KairoSettingsSection />);

    // While loading the skeleton is shown — no Save button rendered.
    expect(screen.getByTestId("kairo-skeleton")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /save kairo configuration/i })).toBeNull();
  });

  it("transitions save button label: idle → saving → saved → idle", async () => {
    useEmptyConfig();

    render(<KairoSettingsSection />);

    await waitFor(() => expect(screen.queryByTestId("kairo-skeleton")).toBeNull());

    // Idle state: button reads "Save".
    const saveBtn = screen.getByRole("button", { name: /save kairo configuration/i });
    expect(saveBtn.textContent).toBe("Save");

    // Tap save — setItemAsync resolves immediately via the mock.
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    // After resolution the button should read "Saved".
    expect(saveBtn.textContent).toBe("Saved");

    // After the 1800 ms flash timer it should return to "Save".
    await act(async () => {
      await new Promise((r) => setTimeout(r, 2000));
    });

    expect(saveBtn.textContent).toBe("Save");
  });

  it("shows an error instead of Saved when storage write fails", async () => {
    useEmptyConfig();
    vi.mocked(SecureStore.setItemAsync).mockRejectedValue(new Error("keychain unavailable"));

    render(<KairoSettingsSection />);

    await waitFor(() => expect(screen.queryByTestId("kairo-skeleton")).toBeNull());

    const saveBtn = screen.getByRole("button", { name: /save kairo configuration/i });
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(screen.getByText("Could not save Kairo settings.")).toBeTruthy();
    expect(saveBtn.textContent).toBe("Save");
  });

  it("shows an error instead of Cleared when storage delete fails", async () => {
    useCustomEndpointConfig();
    vi.mocked(SecureStore.deleteItemAsync).mockRejectedValue(new Error("keychain unavailable"));

    render(<KairoSettingsSection />);

    await waitFor(() => expect(screen.queryByTestId("kairo-skeleton")).toBeNull());

    const clearBtn = screen.getByRole("button", { name: /clear kairo configuration/i });
    await act(async () => {
      fireEvent.click(clearBtn);
    });

    expect(screen.getByText("Could not clear Kairo settings.")).toBeTruthy();
    expect(clearBtn.textContent).toBe("Clear");
  });
});
