import { describe, expect, test } from "bun:test";
import { mobileChange } from "./contracts";

describe("mobileChange", () => {
  test.each([
    "apps/mobile/src/screens/Today.tsx",
    "convex/_generated/api.d.ts",
    "convex/_generated/dataModel.d.ts",
    "patches/react-native+0.86.3.patch",
    "scripts/mobile-ci/build-base.sh",
    "scripts/mobile-performance/native-check.py",
    ".github/actions/mobile-device/action.yml",
    ".github/workflows/mobile-native-ci.yml",
    ".github/workflows/ci.yml",
    "package.json",
    "bun.lock",
    "src/lib/shared.ts",
    "new-top-level/config.ts",
  ])("runs native CI for %s", (path) => {
    expect(mobileChange([path])).toBe(true);
  });

  test.each([
    "convex/tasks.ts",
    "convex/schema.ts",
    "convex/sync.ts",
    "apps/mobile/docs/README.md",
    "apps/mobile/src/test/today.test.ts",
    "src/components/TaskCard.tsx",
    "docs/mobile/native-ci.md",
    "packages/cli/src/pravah.ts",
    ".github/actions/setup-workspace/action.yml",
    ".github/workflows/release-please.yml",
    "README.md",
  ])("skips native CI for %s", (path) => {
    expect(mobileChange([path])).toBe(false);
  });

  test("any native path in a mixed change requires native CI", () => {
    expect(mobileChange(["convex/tasks.ts", "docs/x.md", "apps/mobile/app.json"])).toBe(true);
  });
});
