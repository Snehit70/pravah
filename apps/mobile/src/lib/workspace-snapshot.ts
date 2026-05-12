import type { MobileTask } from "../components/TaskCard";

export type WorkspaceSnapshot = {
  capturedAt: number;
  inboxTasks: MobileTask[];
  scheduledTasks: MobileTask[];
  completedTasks: MobileTask[];
};

function isTaskStatus(value: unknown): value is MobileTask["status"] {
  return value === "inbox" || value === "scheduled" || value === "completed" || value === "cancelled";
}

function isTaskPriority(value: unknown): value is MobileTask["priority"] {
  return value === undefined || value === "p1" || value === "p2" || value === "p3";
}

function isMobileTask(value: unknown): value is MobileTask {
  if (!value || typeof value !== "object") return false;
  const task = value as Record<string, unknown>;
  return (
    typeof task._id === "string" &&
    typeof task.title === "string" &&
    isTaskStatus(task.status) &&
    typeof task.position === "number" &&
    typeof task.updatedAt === "number" &&
    (task.description === undefined || typeof task.description === "string") &&
    (task.deadline === undefined || typeof task.deadline === "string") &&
    isTaskPriority(task.priority) &&
    (task.scheduledDate === undefined || typeof task.scheduledDate === "string")
  );
}

function sanitizeTasks(value: unknown): MobileTask[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isMobileTask);
}

export function hydrateWorkspaceSnapshot(raw: string): WorkspaceSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.capturedAt !== "number") return null;
    return {
      capturedAt: parsed.capturedAt,
      inboxTasks: sanitizeTasks(parsed.inboxTasks),
      scheduledTasks: sanitizeTasks(parsed.scheduledTasks),
      completedTasks: sanitizeTasks(parsed.completedTasks),
    };
  } catch {
    return null;
  }
}

export function prepareWorkspaceSnapshotForPersist(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    capturedAt: snapshot.capturedAt,
    inboxTasks: snapshot.inboxTasks.slice(0, 120),
    scheduledTasks: snapshot.scheduledTasks.slice(0, 160),
    completedTasks: snapshot.completedTasks.slice(0, 120),
  };
}
