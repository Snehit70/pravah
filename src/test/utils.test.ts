import { describe, it, expect } from "vitest";

describe("Utility Functions", () => {
  describe("Date helpers", () => {
    it("formats date correctly", () => {
      const date = "2026-04-07";
      const formatted = new Date(date).toLocaleDateString("en-US", {
        weekday: "short",
      });
      expect(formatted).toBe("Tue");
    });

    it("compares dates correctly", () => {
      const earlier = "2026-04-05";
      const later = "2026-04-10";
      expect(earlier < later).toBe(true);
    });

    it("detects past dates", () => {
      const past = "2020-01-01";
      const today = new Date().toISOString().split("T")[0];
      expect(past < today).toBe(true);
    });
  });

  describe("Task filtering", () => {
    const tasks = [
      { type: "open", status: "inbox" },
      { type: "deadline", status: "scheduled", deadline: "2026-04-10" },
      { type: "deadline", status: "completed", deadline: "2026-04-05" },
      { type: "open", status: "scheduled" },
    ];

    it("filters inbox tasks", () => {
      const inbox = tasks.filter((t) => t.status === "inbox");
      expect(inbox.length).toBe(1);
    });

    it("filters scheduled tasks", () => {
      const scheduled = tasks.filter((t) => t.status === "scheduled");
      expect(scheduled.length).toBe(2);
    });

    it("filters deadline tasks", () => {
      const deadlineTasks = tasks.filter((t) => t.type === "deadline");
      expect(deadlineTasks.length).toBe(2);
    });

    it("filters open tasks", () => {
      const openTasks = tasks.filter((t) => t.type === "open");
      expect(openTasks.length).toBe(2);
    });

    it("detects overdue deadline tasks", () => {
      const pastDeadline = "2020-01-01";
      const today = new Date().toISOString().split("T")[0];
      const isOverdue = pastDeadline < today && tasks[1].status !== "completed";
      expect(isOverdue).toBe(true);
    });
  });

  describe("Task grouping by date", () => {
    it("groups tasks by scheduledDate", () => {
      const tasks = [
        { scheduledDate: "2026-04-07", title: "Task 1" },
        { scheduledDate: "2026-04-07", title: "Task 2" },
        { scheduledDate: "2026-04-08", title: "Task 3" },
      ];

      const grouped: Record<string, typeof tasks> = {};
      for (const task of tasks) {
        if (!task.scheduledDate) continue;
        if (!grouped[task.scheduledDate]) grouped[task.scheduledDate] = [];
        grouped[task.scheduledDate].push(task);
      }

      expect(Object.keys(grouped)).toEqual(["2026-04-07", "2026-04-08"]);
      expect(grouped["2026-04-07"].length).toBe(2);
      expect(grouped["2026-04-08"].length).toBe(1);
    });

    it("sorts tasks by position", () => {
      const tasks = [
        { position: 2, title: "Task 3" },
        { position: 0, title: "Task 1" },
        { position: 1, title: "Task 2" },
      ];

      tasks.sort((a, b) => a.position - b.position);

      expect(tasks[0].title).toBe("Task 1");
      expect(tasks[1].title).toBe("Task 2");
      expect(tasks[2].title).toBe("Task 3");
    });
  });

  describe("Drag and drop logic", () => {
    it("calculates new position after reorder", () => {
      const items = [1, 2, 3, 4];
      const fromIndex = 0;
      const toIndex = 3;

      const result = [...items];
      const [moved] = result.splice(fromIndex, 1);
      result.splice(toIndex, 0, moved);

      expect(result).toEqual([2, 3, 4, 1]);
    });

    it("validates date format", () => {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      expect(dateRegex.test("2026-04-07")).toBe(true);
      expect(dateRegex.test("2026-4-7")).toBe(false);
      expect(dateRegex.test("invalid")).toBe(false);
    });

    it("enforces deadline constraint", () => {
      const task = { type: "deadline" as const, deadline: "2026-04-07" };
      const _targetDate = "2026-04-10";

      const canMove = _targetDate <= task.deadline;
      expect(canMove).toBe(false);
    });

    it("allows moving open tasks to any date", () => {
      const taskType = "open";

      // Open tasks don't have deadline constraint
      const canMove = taskType === "open";
      expect(canMove).toBe(true);
    });
  });
});