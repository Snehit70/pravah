import type { MobileTask } from "../components/TaskCard";
import type { TaskImageFilmstripEntry } from "../components/TaskImageFilmstrip";

export type WorkspaceSnapshot = {
  capturedAt: number;
  inboxTasks: MobileTask[];
  scheduledTasks: MobileTask[];
  completedTasks: MobileTask[];
};

function isTaskPriority(value: unknown): value is MobileTask["priority"] {
  return value === undefined || value === "p1" || value === "p2" || value === "p3";
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizePresentation(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const presentation = {
    width: finiteNumber(source.width) ? source.width : undefined,
    height: finiteNumber(source.height) ? source.height : undefined,
    aspectRatio: finiteNumber(source.aspectRatio) ? source.aspectRatio : undefined,
    hasTransparency:
      typeof source.hasTransparency === "boolean" ? source.hasTransparency : undefined,
    variantSet: typeof source.variantSet === "string" ? source.variantSet : undefined,
  };
  return Object.values(presentation).some((entry) => entry !== undefined)
    ? presentation
    : undefined;
}

function sanitizeActiveImage(value: unknown): TaskImageFilmstripEntry | null {
  if (!value || typeof value !== "object") return null;
  const image = value as Record<string, unknown>;
  if (typeof image.taskImageId !== "string" || !Number.isInteger(image.position)) return null;
  const knownStates = new Set(["pending", "uploading", "verifying", "ready", "failed"]);
  const state = knownStates.has(String(image.state))
    ? (image.state as TaskImageFilmstripEntry["state"])
    : "unavailable";
  const failureSource = image.failure && typeof image.failure === "object"
    ? image.failure as Record<string, unknown>
    : undefined;
  return {
    taskImageId: image.taskImageId,
    position: image.position as number,
    caption: typeof image.caption === "string" ? image.caption : undefined,
    state,
    failure:
      failureSource && typeof failureSource.code === "string"
        ? {
            code: failureSource.code,
            message:
              typeof failureSource.message === "string" ? failureSource.message : undefined,
            retryable: failureSource.retryable === true,
          }
        : undefined,
    presentation: sanitizePresentation(image.presentation),
  };
}

function sanitizeActiveCollection(
  value: unknown,
  fallbackObservedAt: number
): NonNullable<MobileTask["imageCollection"]> {
  if (!value || typeof value !== "object") {
    return { revision: 0, observedAt: fallbackObservedAt, active: [] };
  }
  const collection = value as Record<string, unknown>;
  return {
    revision: Number.isInteger(collection.revision) && (collection.revision as number) >= 0
      ? collection.revision as number
      : 0,
    observedAt: finiteNumber(collection.observedAt)
      ? collection.observedAt
      : fallbackObservedAt,
    active: Array.isArray(collection.active)
      ? collection.active
          .map(sanitizeActiveImage)
          .filter((image): image is TaskImageFilmstripEntry => image !== null)
          .sort((left, right) => left.position - right.position)
      : [],
  };
}

function sanitizeMobileTask(value: unknown, capturedAt: number): MobileTask | null {
  if (!value || typeof value !== "object") return null;
  const task = value as Record<string, unknown>;
  if (!(
    typeof task._id === "string" &&
    typeof task.title === "string" &&
    typeof task.position === "number" &&
    typeof task.scheduledAt === "number" &&
    typeof task.createdAt === "number" &&
    typeof task.updatedAt === "number" &&
    (task.description === undefined || typeof task.description === "string") &&
    (task.deadline === undefined || typeof task.deadline === "string") &&
    (task.completedAt === undefined || typeof task.completedAt === "number") &&
    (task.cancelledAt === undefined || typeof task.cancelledAt === "number") &&
    isTaskPriority(task.priority)
  )) return null;
  return {
    _id: task._id as MobileTask["_id"],
    title: task.title,
    description: typeof task.description === "string" ? task.description : undefined,
    deadline: typeof task.deadline === "string" ? task.deadline : undefined,
    time: typeof task.time === "string" ? task.time : undefined,
    scheduledAt: task.scheduledAt,
    completedAt: typeof task.completedAt === "number" ? task.completedAt : undefined,
    cancelledAt: typeof task.cancelledAt === "number" ? task.cancelledAt : undefined,
    priority: task.priority as MobileTask["priority"],
    position: task.position,
    updatedAt: task.updatedAt,
    createdAt: task.createdAt,
    imageCollection: sanitizeActiveCollection(task.imageCollection, capturedAt),
  };
}

function sanitizeTasks(value: unknown, capturedAt: number): MobileTask[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((task) => sanitizeMobileTask(task, capturedAt))
    .filter((task): task is MobileTask => task !== null);
}

export function hydrateWorkspaceSnapshot(raw: string): WorkspaceSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.capturedAt !== "number") return null;
    return {
      capturedAt: parsed.capturedAt,
      inboxTasks: sanitizeTasks(parsed.inboxTasks, parsed.capturedAt),
      scheduledTasks: sanitizeTasks(parsed.scheduledTasks, parsed.capturedAt),
      completedTasks: sanitizeTasks(parsed.completedTasks, parsed.capturedAt),
    };
  } catch {
    return null;
  }
}

export function prepareWorkspaceSnapshotForPersist(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    capturedAt: snapshot.capturedAt,
    inboxTasks: sanitizeTasks(snapshot.inboxTasks.slice(0, 120), snapshot.capturedAt),
    scheduledTasks: sanitizeTasks(snapshot.scheduledTasks.slice(0, 160), snapshot.capturedAt),
    completedTasks: sanitizeTasks(snapshot.completedTasks.slice(0, 120), snapshot.capturedAt),
  };
}
