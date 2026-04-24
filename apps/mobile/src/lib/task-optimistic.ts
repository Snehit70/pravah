import type { MobileTask } from "../components/TaskCard";
import type { Id } from "../../../../convex/_generated/dataModel";

export function removeTaskFromOptimisticView(tasks: MobileTask[], taskId: Id<"tasks">): MobileTask[] {
  return tasks.filter((task) => task._id !== taskId);
}

export function patchTaskInOptimisticView(
  tasks: MobileTask[],
  taskId: Id<"tasks">,
  updates: Partial<MobileTask>,
  updatedAt: number
): MobileTask[] {
  return tasks.map((task) =>
    task._id === taskId
      ? {
          ...task,
          ...updates,
          updatedAt,
        }
      : task
  );
}

export function reorderScopedTasksInOptimisticView(
  tasks: MobileTask[],
  taskIds: Id<"tasks">[],
  predicate: (task: MobileTask) => boolean,
  updatedAt: number
): MobileTask[] {
  const positionMap = new Map(taskIds.map((taskId, index) => [taskId, index]));

  return tasks.map((task) =>
    predicate(task) && positionMap.has(task._id)
      ? {
          ...task,
          position: positionMap.get(task._id) ?? task.position,
          updatedAt,
        }
      : task
  );
}

export function shiftTaskWithinScopedOptimisticView(
  tasks: MobileTask[],
  taskId: Id<"tasks">,
  predicate: (task: MobileTask) => boolean,
  direction: "up" | "down",
  updatedAt: number
): MobileTask[] {
  const scopedTasks = tasks
    .filter(predicate)
    .slice()
    .sort((a, b) => a.position - b.position);
  const currentIndex = scopedTasks.findIndex((task) => task._id === taskId);
  if (currentIndex === -1) return tasks;

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= scopedTasks.length) return tasks;

  const reordered = scopedTasks.slice();
  const [movedTask] = reordered.splice(currentIndex, 1);
  reordered.splice(targetIndex, 0, movedTask);

  const positionMap = new Map(reordered.map((task, index) => [task._id, index]));

  return tasks.map((task) =>
    predicate(task) && positionMap.has(task._id)
      ? {
          ...task,
          position: positionMap.get(task._id) ?? task.position,
          updatedAt,
        }
      : task
  );
}
