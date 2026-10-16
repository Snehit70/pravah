import { useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useMutation, usePaginatedQuery } from "../../lib/data";
import { isTaskCancelled, isTaskCompleted } from "../../lib/taskState";
import { compareTaskOrder } from "../../lib/taskLifecycle";
import { getLocalDateString } from "../../lib/utils";
import type { Task } from "../../types";
import type { GoalProgress, GoalReadModel } from "../LongTermGoalsPage";
import { GoalTaskComposer } from "./GoalTaskComposer";

export function GoalTasks({ goal, progress, onOpenTask, readOnly }: {
  goal: GoalReadModel;
  progress?: GoalProgress;
  onOpenTask?: (task: Task) => void;
  readOnly: boolean;
}) {
  const { results, status, loadMore } = usePaginatedQuery(api.goals.listTasks, { goalClientId: goal.id }, { initialNumItems: 50 });
  const tasks = [...new Map(results.map((task) => [task._id, task])).values()].filter((task) => !isTaskCancelled(task));
  const active = tasks.filter((task) => !isTaskCompleted(task)).sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || compareTaskOrder(a, b));
  const completed = tasks.filter(isTaskCompleted).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));

  return (
    <div className="pt-6">
      {!readOnly && <GoalTaskComposer goalId={goal.id} />}
      {status === "LoadingFirstPage" ? <div role="status" aria-label="Loading linked tasks" className="space-y-3 py-4">{[0, 1, 2].map((key) => <div key={key} className="h-14 rounded-md bg-fill-soft" />)}</div> : (
        <>
          <p className="mb-5 text-xs text-ink-mute" role="status">{status === "Exhausted" ? `${tasks.length} linked tasks` : `${tasks.length}${progress ? ` of ${progress.total}` : ""} linked tasks loaded. Load more to see the rest.`}</p>
          <TaskSection title="Active tasks" tasks={active} onOpenTask={onOpenTask} readOnly={readOnly} />
          <TaskSection title="Completed tasks" tasks={completed} onOpenTask={onOpenTask} readOnly={readOnly} />
          {status !== "Exhausted" && <button type="button" disabled={status === "LoadingMore"} onClick={() => loadMore(50)} className="mt-6 min-h-11 rounded-md border border-line px-4 text-sm text-ink-soft hover:bg-fill-soft disabled:opacity-50">{status === "LoadingMore" ? "Loading more…" : "Load more linked tasks"}</button>}
        </>
      )}
    </div>
  );
}

function TaskSection({ title, tasks, onOpenTask, readOnly }: {
  title: string;
  tasks: Task[];
  onOpenTask?: (task: Task) => void;
  readOnly: boolean;
}) {
  return <section aria-label={title} className="mb-8">
    <h2 className="mb-3 text-base font-semibold text-ink">{title} <span className="ml-2 text-sm font-normal text-ink-mute">{tasks.length} loaded</span></h2>
    {tasks.length === 0 ? <p className="py-3 text-sm text-ink-mute">No {title.toLowerCase()} in the loaded tasks.</p> : <ul className="divide-y divide-line-subtle">{tasks.map((task) => <GoalTaskRow key={task._id} task={task} onOpenTask={onOpenTask} readOnly={readOnly} />)}</ul>}
  </section>;
}

function GoalTaskRow({ task, onOpenTask, readOnly }: { task: Task; onOpenTask?: (task: Task) => void; readOnly: boolean }) {
  const complete = useMutation(api.tasks.completeTask);
  const reopen = useMutation(api.tasks.reopenTask);
  const schedule = useMutation(api.tasks.moveTask);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState("");
  const completed = isTaskCompleted(task);
  const overdue = Boolean(task.deadline && task.deadline < getLocalDateString() && !completed);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try { await action(); setScheduleDate(""); }
    catch { setError("Could not update this task. Try again."); }
    finally { setBusy(false); }
  };
  return <li className="py-3">
    <div className="flex flex-wrap items-center gap-3">
      {!readOnly && <button type="button" disabled={busy} aria-label={`${completed ? "Reopen" : "Complete"} ${task.title}`} onClick={() => void run(() => completed ? reopen({ taskId: task._id }) : complete({ taskId: task._id }))} className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-line text-ink-soft hover:bg-fill-soft disabled:opacity-50"><span aria-hidden>{completed ? "✓" : "○"}</span></button>}
      <div className="min-w-0 flex-1 basis-48">
        <button type="button" onClick={() => onOpenTask?.(task)} className="min-h-9 break-words text-left text-sm font-medium text-ink hover:text-accent">{task.title}</button>
        <p className="flex flex-wrap gap-3 text-xs text-ink-mute">
          <span className={overdue ? "text-error" : undefined}>{completed ? `Completed ${new Date(task.completedAt ?? task.updatedAt).toLocaleDateString()}` : task.deadline ? `${overdue ? "Overdue · " : "Scheduled "}${task.deadline}${task.time ? ` at ${task.time}` : ""}` : "Inbox"}</span>
          {task.priority && <span className="uppercase">{task.priority}</span>}
        </p>
      </div>
      {!readOnly && !completed && !task.deadline && <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => { event.preventDefault(); if (scheduleDate) void run(() => schedule({ taskId: task._id, targetDate: scheduleDate })); }}>
        <input type="date" aria-label={`Schedule ${task.title}`} required value={scheduleDate} disabled={busy} onChange={(event) => setScheduleDate(event.target.value)} className="min-h-11 min-w-0 rounded-md border border-line bg-[var(--color-bg-surface)] px-2 text-sm text-ink" />
        <button type="submit" disabled={busy || !scheduleDate} className="min-h-11 rounded-md border border-line px-3 text-xs text-ink-soft disabled:opacity-50">Schedule</button>
      </form>}
    </div>
    {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
  </li>;
}
