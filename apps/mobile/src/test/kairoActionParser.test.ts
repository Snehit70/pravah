import { describe, expect, it } from "vitest";
import { extractKairoActions } from "../lib/kairoApi";

describe("extractKairoActions", () => {
  it("returns no actions for plain prose", () => {
    const { cleanText, actions } = extractKairoActions("Here is your plan for the week.");
    expect(actions).toEqual([]);
    expect(cleanText).toBe("Here is your plan for the week.");
  });

  it("parses an add-task block with explicit type", () => {
    const raw = `Got it. <add-task>{"title":"Email Sara","scheduledDate":"2026-05-20","type":"deadline"}</add-task>`;
    const { cleanText, actions } = extractKairoActions(raw);
    expect(actions).toEqual([
      { kind: "add", title: "Email Sara", scheduledDate: "2026-05-20", type: "deadline" },
    ]);
    expect(cleanText).toBe("Got it.");
  });

  it("defaults add-task to type 'open' and scheduledDate null when omitted", () => {
    const { actions } = extractKairoActions(`<add-task>{"title":"Inbox item"}</add-task>`);
    expect(actions).toEqual([
      { kind: "add", title: "Inbox item", scheduledDate: null, type: "open" },
    ]);
  });

  it("parses reschedule, complete, unschedule, and delete blocks", () => {
    const raw = `Done.
<reschedule-task>{"id":"T1","scheduledDate":"2026-05-22"}</reschedule-task>
<complete-task>{"id":"T2"}</complete-task>
<unschedule-task>{"id":"T3"}</unschedule-task>
<delete-task>{"id":"T4"}</delete-task>`;
    const { cleanText, actions } = extractKairoActions(raw);
    expect(actions).toEqual([
      { kind: "reschedule", handle: "T1", scheduledDate: "2026-05-22" },
      { kind: "complete", handle: "T2" },
      { kind: "unschedule", handle: "T3" },
      { kind: "delete", handle: "T4" },
    ]);
    expect(cleanText).toBe("Done.");
  });

  it("tolerates a backslash-escaped closing slash in the tag", () => {
    // Some model outputs emit `<\/delete-task>` instead of `</delete-task>`,
    // mimicking regex/HTML escape conventions. The parser must still extract
    // the action and strip the tag from the visible text.
    const raw = `Deleted.\n<delete-task>{"id":"T7"}<\\/delete-task>`;
    const { cleanText, actions } = extractKairoActions(raw);
    expect(actions).toEqual([{ kind: "delete", handle: "T7" }]);
    expect(cleanText).toBe("Deleted.");
  });

  it("parses update-task with partial fields", () => {
    const { actions } = extractKairoActions(
      `<update-task>{"id":"T5","title":"Renamed","priority":"p1"}</update-task>`
    );
    expect(actions).toEqual([
      { kind: "update", handle: "T5", title: "Renamed", priority: "p1", deadline: undefined },
    ]);
  });

  it("distinguishes deadline:null (clear) from absent deadline in update-task", () => {
    const { actions } = extractKairoActions(
      `<update-task>{"id":"T5","deadline":null}</update-task>`
    );
    expect(actions[0]).toMatchObject({ kind: "update", handle: "T5", deadline: null });
  });

  it("skips update-task blocks that change nothing", () => {
    const { actions } = extractKairoActions(`<update-task>{"id":"T5"}</update-task>`);
    expect(actions).toEqual([]);
  });

  it("drops malformed JSON without throwing", () => {
    const { cleanText, actions } = extractKairoActions(
      `<add-task>{"title": broken}</add-task><complete-task>{"id":"T1"}</complete-task>`
    );
    expect(actions).toEqual([{ kind: "complete", handle: "T1" }]);
    expect(cleanText).toBe("");
  });

  it("preserves the order in which blocks appear", () => {
    const raw = `<complete-task>{"id":"T2"}</complete-task><add-task>{"title":"x"}</add-task>`;
    const { actions } = extractKairoActions(raw);
    expect(actions.map((a) => a.kind)).toEqual(["complete", "add"]);
  });

  it("accepts 'handle' as an alias for 'id' on reference blocks", () => {
    const { actions } = extractKairoActions(
      `<complete-task>{"handle":"T9"}</complete-task>`
    );
    expect(actions).toEqual([{ kind: "complete", handle: "T9" }]);
  });

  it("parses add-goal with optional fields", () => {
    const { actions } = extractKairoActions(
      `<add-goal>{"text":"Launch beta","description":"ship","deadline":"2026-06-20","priority":"p1"}</add-goal>`
    );
    expect(actions).toEqual([
      {
        kind: "addGoal",
        text: "Launch beta",
        description: "ship",
        deadline: "2026-06-20",
        priority: "p1",
      },
    ]);
  });

  it("parses update-goal clear semantics with null", () => {
    const { actions } = extractKairoActions(
      `<update-goal>{"id":"G1","description":null,"deadline":null,"priority":null}</update-goal>`
    );
    expect(actions).toEqual([
      {
        kind: "updateGoal",
        handle: "G1",
        text: undefined,
        description: null,
        deadline: null,
        priority: null,
      },
    ]);
  });

  it("parses delete-goal and task-goal link blocks", () => {
    const { actions } = extractKairoActions(`
      <delete-goal>{"id":"G2"}</delete-goal>
      <link-task-goal>{"taskId":"T1","goalId":"G2"}</link-task-goal>
      <unlink-task-goal>{"taskId":"T1"}</unlink-task-goal>
    `);
    expect(actions).toEqual([
      { kind: "deleteGoal", handle: "G2" },
      { kind: "linkTaskGoal", taskHandle: "T1", goalHandle: "G2" },
      { kind: "unlinkTaskGoal", taskHandle: "T1" },
    ]);
  });

  it("drops update-goal blocks that contain no mutable fields", () => {
    const { actions } = extractKairoActions(`<update-goal>{"id":"G1"}</update-goal>`);
    expect(actions).toEqual([]);
  });
});
