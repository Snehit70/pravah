import type { Task } from "../../types";
import type { GoalProgress, GoalReadModel } from "../LongTermGoalsPage";
import { getLocalDateString } from "../../lib/utils";
import { isTaskCompleted } from "../../lib/taskState";

interface EditFields {
  title: string;
  description: string;
  deadline: string;
  priority: "p1" | "p2" | "p3" | undefined;
  setTitle: (value: string) => void;
  setDescription: (value: string) => void;
  setDeadline: (value: string) => void;
  setPriority: (value: "p1" | "p2" | "p3" | undefined) => void;
}

export function GoalCard({
  goal, progress, linkedTasks, busy, canEdit, canDelete, editing,
  onBeginEdit, onOpenGoal, onOpenTask, onRemove, editFields, onSaveEdit, onCancelEdit,
}: {
  goal: GoalReadModel;
  progress: GoalProgress;
  linkedTasks: Task[];
  busy: boolean;
  canEdit: boolean;
  canDelete: boolean;
  editing: boolean;
  onBeginEdit: () => void;
  onOpenGoal?: () => void;
  onOpenTask?: (task: Task) => void;
  onRemove: () => void;
  editFields: EditFields;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const { total, done } = progress;
  const complete = total > 0 && done >= total;
  const percent = total > 0 ? Math.min(100, Math.round(done / total * 100)) : 0;
  const overdue = Boolean(goal.deadline && goal.deadline < getLocalDateString() && !complete);
  const nextTasks = linkedTasks.filter((task) => !isTaskCompleted(task))
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")).slice(0, 2);

  return (
    <article className="border-b border-line-subtle py-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          {onOpenGoal ? (
            <h2><button type="button" onClick={onOpenGoal} className="min-h-11 text-left text-lg font-semibold text-ink hover:text-accent">{goal.text}</button></h2>
          ) : <h1 className="break-words text-2xl font-semibold text-ink">{goal.text}</h1>}
          {goal.description && <p className="mt-1 max-w-prose whitespace-pre-wrap break-words text-sm leading-6 text-ink-soft">{goal.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-ink-mute">
            {goal.priority && <span className="font-semibold uppercase">{goal.priority}</span>}
            <span>{complete ? "All done" : total === 0 ? "No tasks linked" : `${done} of ${total} done`}</span>
            {goal.deadline && <span className={overdue ? "text-error" : "text-ink-soft"}>{overdue ? "Overdue · " : "Due "}{new Date(`${goal.deadline}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</span>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onOpenGoal && <button type="button" onClick={onOpenGoal} aria-label={`View all tasks for ${goal.text}`} className="min-h-11 rounded-md border border-line px-3 text-sm text-ink-soft hover:bg-fill-soft">View tasks <span aria-hidden>→</span></button>}
          {canEdit && <button type="button" disabled={busy} onClick={onBeginEdit} aria-label={`Edit goal: ${goal.text}`} className="min-h-11 rounded-md px-3 text-sm text-ink-soft hover:bg-fill-soft">Edit</button>}
          {canDelete && <button type="button" disabled={busy} onClick={onRemove} aria-label={`Delete goal: ${goal.text}`} className="min-h-11 rounded-md px-3 text-sm text-ink-mute hover:bg-error-muted hover:text-error">Delete</button>}
        </div>
      </div>
      <div role="progressbar" aria-label={`Progress for ${goal.text}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${done} of ${total} tasks completed`} className="mt-4 h-1 overflow-hidden rounded-full bg-fill-strong">
        <div className="h-full origin-left" style={{ transform: `scaleX(${percent / 100})`, background: complete ? "var(--color-success)" : "var(--color-accent-primary)" }} />
      </div>
      {nextTasks.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-mute"><span>Next up</span>{nextTasks.map((task) => <button type="button" key={task._id} onClick={() => onOpenTask?.(task)} className="min-h-9 max-w-full truncate text-left text-ink-soft hover:text-accent">{task.title}</button>)}</div>}
      {editing && (
        <form className="mt-5 grid gap-4 rounded-lg bg-[var(--color-bg-surface)] p-4" onSubmit={(event) => { event.preventDefault(); onSaveEdit(); }}>
          <label className="grid gap-1 text-xs text-ink-mute">Goal name
            <input autoFocus required aria-label={`Name for ${goal.text}`} value={editFields.title} onChange={(event) => editFields.setTitle(event.target.value)} className="min-h-11 rounded-md border border-line bg-[var(--color-bg-elevated)] px-3 text-sm text-ink" />
          </label>
          <label className="grid gap-1 text-xs text-ink-mute">Description
            <textarea aria-label={`Description for ${goal.text}`} rows={3} value={editFields.description} onChange={(event) => editFields.setDescription(event.target.value)} className="rounded-md border border-line bg-[var(--color-bg-elevated)] p-3 text-sm text-ink" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-xs text-ink-mute">Deadline
              <input type="date" aria-label={`Deadline for ${goal.text}`} value={editFields.deadline} onChange={(event) => editFields.setDeadline(event.target.value)} className="min-h-11 min-w-0 rounded-md border border-line bg-[var(--color-bg-elevated)] px-3 text-sm text-ink" />
            </label>
            <label className="grid gap-1 text-xs text-ink-mute">Priority
              <select aria-label={`Priority for ${goal.text}`} value={editFields.priority ?? ""} onChange={(event) => editFields.setPriority(event.target.value as EditFields["priority"] || undefined)} className="min-h-11 rounded-md border border-line bg-[var(--color-bg-elevated)] px-3 text-sm text-ink"><option value="">None</option><option value="p1">P1</option><option value="p2">P2</option><option value="p3">P3</option></select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={busy} onClick={onCancelEdit} className="min-h-11 rounded-md px-4 text-sm text-ink-soft">Cancel</button>
            <button type="submit" disabled={busy || !editFields.title.trim()} className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold disabled:opacity-50" style={{ color: "var(--color-text-inverse)" }}>{busy ? "Saving…" : "Save goal"}</button>
          </div>
        </form>
      )}
    </article>
  );
}
