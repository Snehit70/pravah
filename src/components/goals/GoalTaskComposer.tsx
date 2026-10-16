import { useRef, useState } from "react";
import { api } from "../../../convex/_generated/api";
import { useMutation } from "../../lib/data";

export function GoalTaskComposer({ goalId }: { goalId: string }) {
  const createTasks = useMutation(api.tasks.bulkCreateTasks);
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<{ signature: string; key: string } | null>(null);

  const submit = async () => {
    if (!title.trim() || busy) return;
    const tasks = [{ title: title.trim(), deadline: deadline || undefined, goalClientId: goalId }];
    const signature = JSON.stringify(tasks);
    if (request.current?.signature !== signature) request.current = { signature, key: crypto.randomUUID() };
    setBusy(true);
    setError(null);
    try {
      // One transaction creates the task and link. Retrying the same draft
      // after an uncertain response must not create a second task.
      await createTasks({ idempotencyKey: request.current.key, tasks });
      setTitle("");
      setDeadline("");
      request.current = null;
    } catch {
      setError("Could not add this task. Your draft is kept so you can try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form aria-label="Add task to goal" className="mb-6 border-b border-line-subtle pb-5" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
      <label className="mb-2 block text-sm font-medium text-ink" htmlFor="goal-task-title">Add a linked task</label>
      <div className="flex flex-wrap items-end gap-3">
        <input id="goal-task-title" required value={title} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="What needs doing?" className="min-h-11 min-w-0 flex-1 basis-64 rounded-md border border-line bg-[var(--color-bg-elevated)] px-3 text-sm text-ink" />
        <label className="grid gap-1 text-xs text-ink-mute">Schedule date, optional
          <input type="date" aria-label="New task schedule date" value={deadline} disabled={busy} onChange={(event) => setDeadline(event.target.value)} className="min-h-11 rounded-md border border-line bg-[var(--color-bg-elevated)] px-3 text-sm text-ink" />
        </label>
        <button type="submit" disabled={busy || !title.trim()} className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold disabled:opacity-50" style={{ color: "var(--color-text-inverse)" }}>{busy ? "Adding…" : "Add task"}</button>
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-error">{error}</p>}
    </form>
  );
}
