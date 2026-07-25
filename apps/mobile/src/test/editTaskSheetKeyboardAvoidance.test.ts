import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const editTaskSheetSource = readFileSync(
  new URL("../components/EditTaskSheet.tsx", import.meta.url),
  "utf8",
);

describe("EditTaskSheet keyboard avoidance", () => {
  it("uses the keyboard controller on Android and iOS", () => {
    expect(editTaskSheetSource).toContain(
      'import { KeyboardAvoidingView } from "react-native-keyboard-controller";',
    );
    expect(editTaskSheetSource).toMatch(
      /<KeyboardAvoidingView\s+behavior="padding"\s+automaticOffset/,
    );
    expect(editTaskSheetSource).not.toContain(
      'behavior={Platform.OS === "ios" ? "padding" : undefined}',
    );
  });
});
