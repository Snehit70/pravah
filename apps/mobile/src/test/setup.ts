(globalThis as { __DEV__?: boolean }).__DEV__ = false;

// Native Expo modules are not available in happy-dom suites. Keep the shared
// fallback narrow; individual clipboard-focused suites can override it.
import { vi } from "vitest";

vi.mock("expo-clipboard", () => ({
  ContentType: { IMAGE: "image", PLAIN_TEXT: "plain-text" },
  addClipboardListener: vi.fn(() => ({ remove: vi.fn() })),
  hasImageAsync: vi.fn(async () => false),
  getStringAsync: vi.fn(async () => ""),
  getImageAsync: vi.fn(async () => null),
}));

vi.mock("expo-haptics", () => ({
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Error: "error", Warning: "warning" },
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  selectionAsync: vi.fn(async () => undefined),
}));
