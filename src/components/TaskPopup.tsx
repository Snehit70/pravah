import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Task } from "../types";
import { Button } from "./Button";
import { Input, Textarea } from "./Input";
import { Modal } from "./Modal";
import { useToast } from "./useToast";
import { cn, getLocalDateString } from "../lib/utils";

interface TaskPopupProps {
  task: Task;
  onClose: () => void;
}

export function TaskPopup({ task, onClose }: TaskPopupProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [titleError, setTitleError] = useState("");

  const updateTask = useMutation(api.tasks.updateTask);
  const completeTask = useMutation(api.tasks.completeTask);
  const reopenTask = useMutation(api.tasks.reopenTask);
  const unscheduleTask = useMutation(api.tasks.unscheduleTask);
  const deleteTask = useMutation(api.tasks.deleteTask);
  const { showError, showSuccess } = useToast();
  const minDate = getLocalDateString();

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
      });
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
    <Modal isOpen={true} onClose={onClose} title="Edit Task">
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

        {/* Metadata */}
        <div className="flex items-center gap-3 text-[11px] text-zinc-500">
          <span
            className={cn(
              "px-2 py-0.5 rounded-full",
              task.type === "deadline"
                ? "bg-yellow-500/15 text-yellow-400"
                : "bg-amber-500/15 text-amber-400"
            )}
          >
            {task.type === "deadline" ? "Deadline" : "Open"} task
          </span>
          <span className="text-zinc-500">{task.status}</span>
          {task.source && task.source !== "manual" && (
            <>
              <span className="text-zinc-500">via {task.source}</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className={cn(
          "flex items-center gap-2 pt-4",
          "border-t border-zinc-800/60"
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
                className="flex items-center gap-1.5 text-zinc-500 hover:text-red-400"
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
