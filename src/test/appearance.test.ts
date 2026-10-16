/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { APPEARANCE_STORAGE_KEY, getAppearance, initializeAppearance, loadAppearance, setAppearance } from "../lib/appearance";

let media: MediaQueryList;
let dispose: (() => void) | undefined;
let onChange: (() => void) | undefined;

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  media = { matches: false, addEventListener: vi.fn((_type, handler) => { onChange = handler; }), removeEventListener: vi.fn() } as unknown as MediaQueryList;
  vi.stubGlobal("matchMedia", vi.fn(() => media));
});
afterEach(() => { dispose?.(); dispose = undefined; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const theme = () => document.documentElement.dataset.theme;

describe("Web appearance", () => {
  it("defaults to system, responds to device changes, and keeps manual choices stable", () => {
    dispose = initializeAppearance();
    expect(getAppearance()).toBe("system");
    expect(theme()).toBe("light");
    Object.defineProperty(media, "matches", { value: true, configurable: true });
    onChange?.();
    expect(theme()).toBe("dark");
    setAppearance("light");
    onChange?.();
    expect(theme()).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    setAppearance("system");
    expect(theme()).toBe("dark");
  });

  it("restores saved dark mode at startup and persists changes", () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");
    dispose = initializeAppearance();
    expect(getAppearance()).toBe("dark");
    expect(theme()).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
    setAppearance("light");
    expect(loadAppearance()).toBe("light");
  });

  it("follows changes and clearing in another tab", () => {
    dispose = initializeAppearance();
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: APPEARANCE_STORAGE_KEY }));
    expect(getAppearance()).toBe("dark");
    expect(theme()).toBe("dark");
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
    expect(getAppearance()).toBe("system");
    expect(theme()).toBe("light");
  });

  it("ignores invalid preferences and tolerates blocked storage", () => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "sepia");
    dispose = initializeAppearance();
    expect(getAppearance()).toBe("system");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => setAppearance("dark")).not.toThrow();
    expect(theme()).toBe("dark");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(loadAppearance()).toBe("system");
  });

  it("detaches browser listeners on disposal", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    initializeAppearance()();
    expect(media.removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
  });
});

const bootScript = readFileSync(new URL("../../public/theme-init.js", import.meta.url), "utf8");
describe("Theme before first paint", () => {
  it.each(["dark", "light", "system", "invalid"])("resolves %s consistently with the runtime", (stored) => {
    Object.defineProperty(media, "matches", { value: true });
    localStorage.setItem(APPEARANCE_STORAGE_KEY, stored);
    new Function(bootScript)();
    const bootTheme = theme();
    dispose = initializeAppearance();
    expect(theme()).toBe(bootTheme);
    expect(theme()).toBe(stored === "light" ? "light" : "dark");
  });

  it("still follows the system when storage throws before startup", () => {
    Object.defineProperty(media, "matches", { value: true });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(() => new Function(bootScript)()).not.toThrow();
    expect(theme()).toBe("dark");
  });
});
