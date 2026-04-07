import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Task } from "../types";
import { Button } from "./Button";
import { Input, Textarea } from "./Input";
import { Modal } from "./Modal";

interface TaskPopupProps {
  task: Task;
  onClose: () => void;
}

export function TaskPopup({ task, onClose }: TaskPopupProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [deadline, setDeadline] = useState(task.deadline ?? "");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const updateTask = useMutation(api.tasks.updateTask);
  const completeTask = useMutation(api.tasks.completeTask);
  const deleteTask = useMutation(api.tasks.deleteTask);

  const handleSave = async () => {
    await updateTask({
      taskId: task._id,
      title: title.trim() || task.title,
      description: description || undefined,
      deadline: deadline || undefined,
    });
    onClose();
  };

  const handleComplete = async () => {
    await completeTask({ taskId: task._id });
    onClose();
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    await deleteTask({ taskId: task._id });
    onClose();
  };

  const isCompleted = task.status === "completed";

  return (
    <Modal isOpen={true} onClose={onClose} title="Edit Task">
      <div className="space-y-4">
            {/* Title */}
            <Input
              label="Title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
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
              />
            )}

            {/* Metadata */}
            <div className="flex items-center gap-3 text-[11px] text-zinc-600">
              <span>
                {task.type === "deadline" ? "Deadline" : "Open"} task
              </span>
              <span>&middot;</span>
              <span>{task.status}</span>
              {task.source && task.source !== "manual" && (
                <>
                  <span>&middot;</span>
                  <span>via {task.source}</span>
                </>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-2">
              {!isCompleted && (
                <Button
                  onClick={handleComplete}
                  variant="secondary"
                  className="flex-1"
                >
                  Complete
                </Button>
              )}

              <Button
                onClick={handleDelete}
                onBlur={() => setConfirmingDelete(false)}
                variant={confirmingDelete ? "danger" : "ghost"}
                className="flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                {confirmingDelete ? "Confirm" : "Delete"}
              </Button>

              <Button
                onClick={handleSave}
                variant="primary"
                className="flex-1"
              >
                Save
              </Button>
            </div>
          </div>
    </Modal>
  );
}
