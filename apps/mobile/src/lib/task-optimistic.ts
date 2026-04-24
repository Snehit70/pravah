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
