/** @vitest-environment happy-dom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn(),
  install: vi.fn(),
  platformOs: "android" as "android" | "ios",
  applicationId: "com.pravah.mobile",
}));

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
      disabled,
      accessibilityLabel,
      accessibilityRole: __,
      ...safe
    } = rest as {
      onPress?: () => void;
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
      { ...safe, onClick: onPress, disabled, type: "button", "aria-label": accessibilityLabel },
      resolved,
    );
  };
  return {
    View,
    Text,
    Pressable,
    Platform: {
      get OS() {
        return mocks.platformOs;
      },
    },
    StyleSheet: { create: <T,>(styles: T) => styles, hairlineWidth: 1 },
  };
});

vi.mock("expo-application", () => ({
  get applicationId() {
    return mocks.applicationId;
  },
  nativeApplicationVersion: "2.3.0",
}));

vi.mock("../lib/appUpdate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/appUpdate")>()),
  checkForAppUpdate: mocks.checkForAppUpdate,
}));

vi.mock("../hooks/useAppUpdateInstaller", () => ({
  useAppUpdateInstaller: () => ({
    status: "idle",
    progress: 0,
    install: mocks.install,
  }),
}));

vi.mock("../theme/tokens", () => ({
  colors: {
    accent: "#8b7de8",
    bgCard: "#111",
    bgSurface: "#222",
    borderSubtle: "#333",
    textInverse: "#000",
    textMuted: "#999",
    textPrimary: "#fff",
  },
  radii: { full: 999, lg: 12, xl: 18 },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16 },
  typography: { bodyMd: {}, micro: {} },
}));

import { AppUpdateSection } from "../components/AppUpdateSection";

describe("AppUpdateSection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.platformOs = "android";
    mocks.applicationId = "com.pravah.mobile";
  });

  it("is hidden on iOS", () => {
    mocks.platformOs = "ios";
    const { container } = render(<AppUpdateSection />);

    expect(container.textContent).toBe("");
  });

  it("reports up to date after a successful check", async () => {
    mocks.checkForAppUpdate.mockResolvedValue({ status: "up-to-date" });
    render(<AppUpdateSection />);

    fireEvent.click(screen.getByRole("button", { name: /check for app updates/i }));

    await waitFor(() => expect(screen.getByText("You're up to date.")).toBeTruthy());
    expect(mocks.checkForAppUpdate).toHaveBeenCalledWith("2.3.0");
  });

  it("shows release notes and calls the installer for an available update", async () => {
    mocks.checkForAppUpdate.mockResolvedValue({
      status: "update-available",
      version: "2.4.0",
      apkUrl: "https://example.com/pravah.apk",
      md5Url: "https://example.com/pravah.apk.md5",
      releaseNotes: "Keyboard and update fixes.",
    });
    render(<AppUpdateSection />);

    fireEvent.click(screen.getByRole("button", { name: /check for app updates/i }));

    await waitFor(() =>
      expect(screen.getByText(/APK 2\.4\.0 is available\./)).toBeTruthy(),
    );
    expect(screen.getByText("Keyboard and update fixes.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /install pravah 2.4.0/i }));

    expect(mocks.install).toHaveBeenCalledWith(
      expect.objectContaining({ status: "update-available", version: "2.4.0" }),
    );
  });

  it.each([
    [{ status: "offline" }, "Could not reach GitHub. Check your connection and try again."],
    [
      { status: "rate-limited", retryAfter: "120" },
      "GitHub rate limited this device. Try again after 120.",
    ],
    [{ status: "malformed-metadata" }, "The release metadata could not be read safely."],
    [
      { status: "missing-asset", version: "2.4.0" },
      "Version 2.4.0 is missing its APK or checksum.",
    ],
  ])("renders %s update-check errors", async (result, message) => {
    mocks.checkForAppUpdate.mockResolvedValue(result);
    render(<AppUpdateSection />);

    fireEvent.click(screen.getByRole("button", { name: /check for app updates/i }));

    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
  });
});
