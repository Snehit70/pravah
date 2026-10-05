import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useMutation, useQuery } from "../lib/data";
import { api } from "../../convex/_generated/api";
import type { Task } from "../types";
import { Button } from "./Button";
import { Input, Textarea } from "./Input";
import { Modal } from "./Modal";
import { useToast } from "./useToast";
import { cn, getLocalDateString } from "../lib/utils";
import { isWebGoalsLinkingEnabled } from "../lib/featureFlags";
import { getTaskState, isTaskCompleted } from "../lib/taskState";

interface TaskPopupProps {
  task: Task;
  onClose: () => void;
}

export function TaskPopup({ task, onClose }: TaskPopupProps) {
  const webGoalsLinkingEnabled = isWebGoalsLinkingEnabled();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [time, setTime] = useState(task.time ?? "");
  const [priority, setPriority] = useState<"p1" | "p2" | "p3" | undefined>(task.priority);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [titleError, setTitleError] = useState("");
  const goals = useQuery(api.goals.list, webGoalsLinkingEnabled ? {} : "skip");
  const goalLinks = useQuery(api.goals.listLinks, webGoalsLinkingEnabled ? { taskIds: [task._id] } : "skip");
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");

  const updateTask = useMutation(api.tasks.updateTask);
  const setGoalLink = useMutation(api.goals.setLink);
  const completeTask = useMutation(api.tasks.completeTask);
  const reopenTask = useMutation(api.tasks.reopenTask);
  const moveTask = useMutation(api.tasks.moveTask);
  const unscheduleTask = useMutation(api.tasks.unscheduleTask);
  const softDeleteTask = useMutation(api.tasks.softDeleteTask);
  const restoreTask = useMutation(api.tasks.restoreTask);
  const { showToast, showError, showSuccess } = useToast();
  const minDate = getLocalDateString();
  const currentGoalId = webGoalsLinkingEnabled ? (goalLinks?.[String(task._id)] ?? "") : "";
  const selectedOrCurrentGoalId = selectedGoalId || currentGoalId;
  const selectedGoalName = goals?.find((goal) => goal.id === selectedOrCurrentGoalId)?.text;

  const quickScheduleOptions = [
    { label: "Today", date: getLocalDateString() },
    { label: "Tomorrow", date: addDays(getLocalDateString(), 1) },
    { label: "This weekend", date: getComingWeekendDate() },
  ];

  const handleSave = async () => {
    if (!title.trim()) {
      setTitleError("Title is required");
      return;
    }
    setTitleError("");

    try {
      await updateTask({
        taskId: task._id,
        title: title.trim(),
        description: description || undefined,
        // null clears the schedule; undefined would be stripped by Convex
        deadline: deadline || null,
        time: deadline ? time || null : null,
        priority,
      });
      if (webGoalsLinkingEnabled && selectedGoalId !== currentGoalId) {
        try {
          await setGoalLink({
            taskId: String(task._id),
            goalClientId: selectedGoalId || null,
          });
        } catch {
          showError("Task saved, but goal link failed. Try Save again.");
          return;
        }
      }
      showSuccess("Task updated successfully");
      onClose();
    } catch {
      showError("Failed to update task");
    }
  };

  const handleComplete = async () => {
    try {
      await completeTask({ taskId: task._id });
      showSuccess("Task completed!");
      onClose();
    } catch {
      showError("Failed to complete task");
    }
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    try {
      await softDeleteTask({ taskId: task._id });
      showToast("Task moved to trash", "info", {
        label: "Undo",
        run: async () => {
          try {
            await restoreTask({ taskId: task._id });
            showSuccess("Task restored");
          } catch {
            showError("Could not restore task");
          }
        },
      });
      onClose();
    } catch {
      showError("Failed to delete task");
    }
  };

  const handleQuickSchedule = async (date: string, label: string) => {
    try {
      await moveTask({ taskId: task._id, targetDate: date });
      showSuccess(`Scheduled for ${label}`);
      onClose();
    } catch {
      showError("Could not schedule task");
    }
  };

  const hasDeadline = Boolean(task.deadline);
  const isCompleted = isTaskCompleted(task);
  const isScheduled = hasDeadline && !isCompleted;

  const handleReopen = async () => {
    try {
      await reopenTask({ taskId: task._id });
      showSuccess(hasDeadline ? "Task reopened to timeline" : "Task reopened to inbox");
      onClose();
    } catch {
      showError("Failed to reopen task");
    }
  };

  const handleUnschedule = async () => {
    try {
      await unscheduleTask({ taskId: task._id });
      showSuccess("Task moved back to inbox");
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "";
      if (message.includes("Could not find public function for 'tasks:unscheduleTask'")) {
        showError("Unschedule is unavailable on this backend. Run convex dev/deploy.");
        return;
      }
      showError("Failed to unschedule task");
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title="Edit Task" viewTransitionName="task-morph">
      <div className="space-y-4">
        {/* Title */}
        <Input
          label="Title"
          type="text"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (titleError) setTitleError("");
          }}
          error={titleError}
        />

        {/* Description */}
        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Add notes..."
        />

        {/* Deadline */}
        <Input
          label="Deadline"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          min={minDate}
        />

        {deadline && (
          <Input
            label="Time"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        )}

        {!isTaskCompleted(task) && (
          <div>
            <p className="mb-2 block text-[10px] font-medium uppercase tracking-[0.12em] text-ink-mute">
              Quick schedule
            </p>
            <div className="flex flex-wrap gap-1.5">
              {quickScheduleOptions.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => void handleQuickSchedule(option.date, option.label)}
                  className="rounded-[4px] border border-line bg-fill-faint px-2.5 py-1 text-[11px] text-ink-soft transition-colors hover:border-line-strong hover:bg-fill-soft hover:text-ink"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="block text-[10px] text-ink-mute uppercase tracking-[0.12em] font-medium mb-2">
            Priority
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "None", value: undefined },
              { label: "P1", value: "p1" as const },
              { label: "P2", value: "p2" as const },
              { label: "P3", value: "p3" as const },
            ].map((option) => {
              const active = priority === option.value;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => setPriority(option.value)}
                  className={cn(
                    "px-2.5 py-1 rounded-[4px] text-[11px] border",
                    active
                      ? "text-canvas"
                      : "text-ink-soft hover:text-ink"
                  )}
                  style={{
                    background: active
                      ? "var(--color-accent-primary)"
                      : "var(--color-fill-faint)",
                    borderColor: active
                      ? "var(--color-accent-primary)"
                      : "var(--color-border-default)",
                    transition:
                      "background-color var(--dur-instant) var(--ease-out-expo), color var(--dur-instant) var(--ease-out-expo), border-color var(--dur-instant) var(--ease-out-expo)",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-ink-mute">
          <span
            className="px-1.5 py-0.5 rounded-[3px]"
            style={{
              background:
                hasDeadline
                  ? "var(--color-warning-muted)"
                  : "var(--color-accent-primary-muted)",
              color:
                hasDeadline
                  ? "var(--color-warning)"
                  : "var(--color-accent-primary)",
              letterSpacing: "0.08em",
            }}
          >
            {hasDeadline ? "Deadline" : "Open"}
          </span>
          <span>{getTaskState(task)}</span>
          {task.source && task.source !== "manual" && (
            <span>· {task.source}</span>
          )}
          {webGoalsLinkingEnabled && (
            <span title={selectedGoalName ? `Linked goal: ${selectedGoalName}` : "No linked goal"}>
              · {selectedGoalName ? `goal: ${selectedGoalName}` : "goal: none"}
            </span>
          )}
        </div>

        {webGoalsLinkingEnabled && goals && (
          <label className="block">
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.12em] text-ink-mute">
              Linked Goal
            </span>
            <select
              value={selectedGoalId || currentGoalId}
              onChange={(e) => setSelectedGoalId(e.target.value)}
              className="w-full rounded-[3px] border bg-fill-soft px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-accent/45"
              style={{ borderColor: "var(--color-border-default)" }}
              aria-label="Linked Goal"
            >
              <option value="">No goal</option>
              {goals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.text}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Actions */}
        <div className={cn(
          "flex items-center gap-2 pt-4 mt-1",
          "border-t border-line-subtle"
        )}>
          {!confirmingDelete ? (
            <>
              {!isCompleted && (
                <Button
                  onClick={handleComplete}
                  variant="secondary"
                  className="flex-1"
                >
                  Complete
                </Button>
              )}

              {isCompleted && (
                <Button
                  onClick={handleReopen}
                  variant="secondary"
                  className="flex-1"
                >
                  Reopen
                </Button>
              )}

              {isScheduled && !isCompleted && (
                <Button
                  onClick={handleUnschedule}
                  variant="ghost"
                  className="flex-1"
                >
                  Unschedule
                </Button>
              )}

              <Button
                onClick={() => setConfirmingDelete(true)}
                variant="ghost"
                className="flex items-center gap-1.5 text-ink-soft hover:text-error"
              >
                <Trash2 size={14} />
                Delete
              </Button>

              <Button
                onClick={handleSave}
                variant="primary"
                className="flex-1"
              >
                Save
              </Button>
            </>
          ) : (
            <>
              <p className="flex-1 text-sm text-ink-soft">Delete this task?</p>
              <Button
                onClick={() => setConfirmingDelete(false)}
                variant="secondary"
                size="sm"
              >
                Cancel
              </Button>
              <Button
                onClick={handleDelete}
                variant="danger"
                size="sm"
                className="flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function getComingWeekendDate(): string {
  const today = new Date(`${getLocalDateString()}T12:00:00`);
  const untilSaturday = (6 - today.getDay() + 7) % 7;
  return addDays(getLocalDateString(), untilSaturday === 0 ? 7 : untilSaturday);
}
