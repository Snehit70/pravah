export const MAX_BULK_TASKS = 100;

export type BulkTaskInput = {
  title: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
  goalClientId?: string;
};

type ExpandBulkTasksInput = Omit<BulkTaskInput, "title" | "goalClientId"> & {
  baseTitle: string;
  seriesEnabled: boolean;
  start: number;
  end: number;
  goalIds: string[];
};

export function expandBulkTasks(input: ExpandBulkTasksInput): BulkTaskInput[] {
  const baseTitle = input.baseTitle.trim();
  if (!baseTitle) throw new Error("Title is required");
  if (input.seriesEnabled) {
    if (!Number.isInteger(input.start) || !Number.isInteger(input.end)) {
      throw new Error("Series values must be whole numbers");
    }
    if (input.start < 1 || input.end < input.start || input.end > 9999) {
      throw new Error("Series range must be between 1 and 9999");
    }
  }

  const titles = input.seriesEnabled
    ? Array.from({ length: input.end - input.start + 1 }, (_, index) =>
        `${baseTitle} ${input.start + index}`
      )
    : [baseTitle];
  const goals = input.goalIds.length > 0 ? Array.from(new Set(input.goalIds)) : [undefined];
  const count = titles.length * goals.length;
  if (count > MAX_BULK_TASKS) throw new Error(`Maximum is ${MAX_BULK_TASKS} tasks`);

  return titles.flatMap((title) =>
    goals.map((goalClientId) => ({
      title,
      description: input.description,
      deadline: input.deadline,
      priority: input.priority,
      goalClientId,
    }))
  );
}
