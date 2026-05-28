import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Task } from "../types";
import { Button } from "./Button";
import { Input, Textarea } from "./Input";
import { Modal } from "./Modal";
import { useToast } from "./useToast";
import { cn, getLocalDateString } from "../lib/utils";
import { isWebGoalsLinkingEnabled } from "../lib/featureFlags";

interface TaskPopupProps {
  task: Task;
  onClose: () => void;
}

export function TaskPopup({ task, onClose }: TaskPopupProps) {
  const webGoalsLinkingEnabled = isWebGoalsLinkingEnabled();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [priority, setPriority] = useState<"p1" | "p2" | "p3" | undefined>(task.priority);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [titleError, setTitleError] = useState("");
  const goals = useQuery(api.goals.list, webGoalsLinkingEnabled ? {} : "skip");
  const goalLinks = useQuery(api.goals.listLinks, webGoalsLinkingEnabled ? {} : "skip");
  const [selectedGoalId, setSelectedGoalId] = useState<string>("");

  const updateTask = useMutation(api.tasks.updateTask);
  const setGoalLink = useMutation(api.goals.setLink);
  const completeTask = useMutation(api.tasks.completeTask);
  const reopenTask = useMutation(api.tasks.reopenTask);
  const unscheduleTask = useMutation(api.tasks.unscheduleTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const { showError, showSuccess } = useToast();
  const minDate = getLocalDateString();
  const currentGoalId = webGoalsLinkingEnabled ? (goalLinks?.[String(task._id)] ?? "") : "";
  const selectedOrCurrentGoalId = selectedGoalId || currentGoalId;
  const selectedGoalName = goals?.find((goal) => goal.id === selectedOrCurrentGoalId)?.text;

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
        deadline: deadline || undefined,
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
      await deleteTask({ taskId: task._id });
      showSuccess("Task deleted");
      onClose();
    } catch {
      showError("Failed to delete task");
    }
  };

  const handleReopen = async () => {
    try {
      await reopenTask({ taskId: task._id });
      showSuccess("Task reopened to inbox");
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

  const isCompleted = task.status === "completed";
  const isScheduled = task.status === "scheduled";

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
        {task.type === "deadline" && (
          <Input
            label="Deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            min={minDate}
          />
        )}

        <div>
          <p className="block text-[10px] text-zinc-500 uppercase tracking-[0.12em] font-medium mb-2">
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
                      ? "text-zinc-950"
                      : "text-zinc-400 hover:text-zinc-100"
                  )}
                  style={{
                    background: active
                      ? "oklch(0.78 0.14 260)"
                      : "rgba(255,255,255,0.025)",
                    borderColor: active
                      ? "oklch(0.78 0.14 260)"
                      : "rgba(255,255,255,0.08)",
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
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-zinc-500">
          <span
            className="px-1.5 py-0.5 rounded-[3px]"
            style={{
              background:
                task.type === "deadline"
                  ? "oklch(0.78 0.16 80 / 0.12)"
                  : "oklch(0.78 0.14 260 / 0.14)",
              color:
                task.type === "deadline"
                  ? "oklch(0.85 0.14 80)"
                  : "oklch(0.85 0.12 260)",
              letterSpacing: "0.08em",
            }}
          >
            {task.type === "deadline" ? "Deadline" : "Open"}
          </span>
          <span>{task.status}</span>
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
            <span className="mb-1.5 block text-[10px] uppercase tracking-[0.12em] text-zinc-500">
              Linked Goal
            </span>
            <select
              value={selectedGoalId || currentGoalId}
              onChange={(e) => setSelectedGoalId(e.target.value)}
              className="w-full rounded-[3px] border bg-black/20 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-[oklch(0.78_0.14_260_/_0.45)]"
              style={{ borderColor: "rgba(255,255,255,.09)" }}
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
          "border-t border-white/[0.06]"
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
                className="flex items-center gap-1.5 text-zinc-400 hover:text-red-300"
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
              <p className="flex-1 text-sm text-zinc-400">Delete this task?</p>
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
