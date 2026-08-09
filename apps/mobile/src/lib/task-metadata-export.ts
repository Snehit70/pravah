import type { MobileTask } from "../components/TaskCard";
import type { TaskImageFilmstripEntry } from "../components/TaskImageFilmstrip";

type TaskState = "inbox" | "timeline" | "completed";

type ExportOptions = {
  tasks: MobileTask[];
  loadImageCollection: (taskId: MobileTask["_id"]) => Promise<unknown>;
  now?: () => number;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function taskState(task: MobileTask): TaskState | "cancelled" {
  if (task.cancelledAt !== undefined) return "cancelled";
  if (task.completedAt !== undefined) return "completed";
  return task.deadline ? "timeline" : "inbox";
}

function safePresentation(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const result = {
    width: finite(source.width) ? source.width : undefined,
    height: finite(source.height) ? source.height : undefined,
    aspectRatio: finite(source.aspectRatio) ? source.aspectRatio : undefined,
    hasTransparency:
      typeof source.hasTransparency === "boolean" ? source.hasTransparency : undefined,
    variantSet: typeof source.variantSet === "string" ? source.variantSet : undefined,
  };
  return Object.values(result).some((entry) => entry !== undefined) ? result : undefined;
}

function safeFailure(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  if (typeof source.code !== "string") return undefined;
  return {
    code: source.code,
    message: typeof source.message === "string" ? source.message : undefined,
    retryable: source.retryable === true,
  };
}

function safeActive(value: unknown): TaskImageFilmstripEntry | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.taskImageId !== "string" || !Number.isInteger(source.position)) return null;
  const state = ["pending", "uploading", "verifying", "ready", "failed"].includes(String(source.state))
    ? source.state as TaskImageFilmstripEntry["state"]
    : "unavailable";
  return {
    taskImageId: source.taskImageId,
    position: source.position as number,
    caption: typeof source.caption === "string" ? source.caption : undefined,
    state,
    failure: safeFailure(source.failure),
    presentation: safePresentation(source.presentation),
  };
}

function safeRecoverable(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  if (typeof source.taskImageId !== "string") return null;
  return {
    taskImageId: source.taskImageId,
    caption: typeof source.caption === "string" ? source.caption : undefined,
    removedAt: finite(source.removedAt) ? source.removedAt : undefined,
    recoverableUntil: finite(source.recoverableUntil) ? source.recoverableUntil : undefined,
    previousPosition: Number.isInteger(source.previousPosition)
      ? source.previousPosition as number
      : undefined,
  };
}

function safeCollection(value: unknown) {
  if (!value || typeof value !== "object") {
    return { revision: 0, observedAt: 0, active: [], recoverable: [] };
  }
  const source = value as Record<string, unknown>;
  return {
    revision: Number.isInteger(source.revision) && (source.revision as number) >= 0
      ? source.revision as number
      : 0,
    observedAt: finite(source.observedAt) ? source.observedAt : 0,
    active: Array.isArray(source.active)
      ? source.active
          .map(safeActive)
          .filter((entry): entry is TaskImageFilmstripEntry => entry !== null)
          .sort((left, right) => left.position - right.position)
      : [],
    recoverable: Array.isArray(source.recoverable)
      ? source.recoverable
          .map(safeRecoverable)
          .filter((entry): entry is NonNullable<ReturnType<typeof safeRecoverable>> => entry !== null)
      : [],
  };
}

function revisionOf(value: unknown) {
  if (!value || typeof value !== "object") return 0;
  const revision = (value as Record<string, unknown>).revision;
  return Number.isInteger(revision) && (revision as number) >= 0 ? revision as number : 0;
}

async function captureCollection(task: MobileTask, load: ExportOptions["loadImageCollection"]) {
  const first = await load(task._id);
  if (revisionOf(first) === (task.imageCollection?.revision ?? 0)) {
    return { status: "captured" as const, collection: safeCollection(first) };
  }
  const retry = await load(task._id);
  if (revisionOf(retry) !== revisionOf(first)) {
    return { status: "unstable" as const, collection: null };
  }
  return { status: "captured" as const, collection: safeCollection(retry) };
}

export async function buildTaskMetadataExport({
  tasks,
  loadImageCollection,
  now = Date.now,
}: ExportOptions) {
  const exportedAtMs = now();
  const loaded = tasks.filter((task) => taskState(task) !== "cancelled");
  const exportedTasks = await Promise.all(
    loaded.map(async (task) => {
      const capture = await captureCollection(task, loadImageCollection);
      return {
        _id: task._id,
        title: task.title,
        description: task.description,
        deadline: task.deadline,
        time: task.time,
        scheduledAt: task.scheduledAt,
        completedAt: task.completedAt,
        priority: task.priority,
        position: task.position,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        imageManifestStatus: capture.status,
        imageCollection: capture.collection,
      };
    })
  );
  const counts = { inbox: 0, timeline: 0, completed: 0, total: loaded.length };
  for (const task of loaded) counts[taskState(task) as TaskState] += 1;
  return {
    version: 2 as const,
    exportKind: "task-metadata" as const,
    scope: "loaded-workspace" as const,
    includedTaskStates: ["inbox", "timeline", "completed"] as const,
    counts,
    isCompleteBackup: false as const,
    includesImageBinaries: false as const,
    restorableImageContent: false as const,
    exportedAt: new Date(exportedAtMs).toISOString(),
    exportedAtMs,
    tasks: exportedTasks,
  };
}
