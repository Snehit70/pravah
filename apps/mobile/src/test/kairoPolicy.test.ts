import { describe, expect, it, vi } from "vitest";
import type { KairoAction } from "../lib/kairoApi";
import { applyConfirmedKairoActions, buildKairoConfirmation } from "../lib/kairoPolicy";

describe("buildKairoConfirmation", () => {
  it("builds command-specific copy with task context", () => {
    expect(
      buildKairoConfirmation(
        { kind: "reschedule", handle: "T1", scheduledDate: "2026-06-10" },
        "Review launch"
      )
    ).toEqual({
      title: "Move task?",
      message: 'Move "Review launch" to 2026-06-10?',
      confirmLabel: "Move",
      cancelLabel: "Cancel",
    });
  });
});

describe("applyConfirmedKairoActions", () => {
  it("confirms and applies exactly one action at a time", async () => {
    const confirm = vi.fn(async () => true);
    const apply = vi.fn(async (action: KairoAction) => ({
      action,
      status: "applied" as const,
      undo: null,
    }));

    const result = await applyConfirmedKairoActions(
      [
        { kind: "add", title: "One", scheduledDate: null, type: "open" },
        { kind: "complete", handle: "T1" },
      ],
      {
        confirm,
        apply,
        attemptedActionKeys: new Set(),
        beforeTitleFor: (action) => (action.kind === "add" ? null : "Existing task"),
      }
    );

    expect(confirm).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledTimes(2);
    expect(result.results.map((entry) => entry.status)).toEqual(["applied", "applied"]);
  });

  it("does not apply or re-prompt a declined action in the same request", async () => {
    const action: KairoAction = { kind: "complete", handle: "T1" };
    const confirm = vi.fn(async () => false);
    const apply = vi.fn();
    const attemptedActionKeys = new Set<string>();

    const first = await applyConfirmedKairoActions([action], {
      confirm,
      apply,
      attemptedActionKeys,
      beforeTitleFor: () => "Existing task",
    });
    const retry = await applyConfirmedKairoActions([action], {
      confirm,
      apply,
      attemptedActionKeys,
      beforeTitleFor: () => "Existing task",
    });

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(apply).not.toHaveBeenCalled();
    expect(first.results[0]).toMatchObject({ status: "skipped", reason: "User declined this action." });
    expect(retry.results[0]).toMatchObject({
      status: "skipped",
      reason: "This action was already attempted in this request.",
    });
  });
});
