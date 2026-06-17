import { describe, expect, it } from "vitest";
import {
  getTaskCancelledAt,
  getTaskCompletedAt,
  getTaskDeadline,
  getTaskState,
  isInboxTask,
  isTimelineTask,
} from "../../convex/taskLifecycle";

describe("convex taskLifecycle", () => {
  it("keeps legacy scheduledDate as a deadline fallback", () => {
    const task = { scheduledDate: "2026-06-16", updatedAt: 1 };

    expect(getTaskDeadline(task)).toBe("2026-06-16");
    expect(getTaskState(task)).toBe("scheduled");
    expect(isTimelineTask(task)).toBe(true);
    expect(isInboxTask(task)).toBe(false);
  });

  it("keeps legacy status timestamps for completed and cancelled Tasks", () => {
    const completed = { status: "completed", updatedAt: 123 };
    const cancelled = { status: "cancelled", completedAt: 100, updatedAt: 456 };

    expect(getTaskCompletedAt(completed)).toBe(123);
    expect(getTaskState(completed)).toBe("completed");
    expect(getTaskCancelledAt(cancelled)).toBe(456);
    expect(getTaskState(cancelled)).toBe("cancelled");
  });
});
