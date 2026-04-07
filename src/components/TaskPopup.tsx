import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Trash2 } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Task } from "../types";
import { cn } from "../lib/utils";
import { Button } from "./Button";

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
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-label="Edit task"
          className="bg-zinc-900 border border-zinc-700/60 rounded-2xl w-full max-w-md p-6 shadow-2xl shadow-black/40"
        >
          {/* Header */}
          <div className="flex justify-between items-center mb-5">
            <h2 className="text-base font-medium text-white">Edit Task</h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={cn(
                  "w-full bg-zinc-800/80 border border-zinc-700/50 rounded-xl p-3 text-white mt-1.5",
                  "placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none",
                  "transition-colors duration-150",
                )}
              />
            </div>

            {/* Description */}
            <div>
              <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Add notes..."
                className={cn(
                  "w-full bg-zinc-800/80 border border-zinc-700/50 rounded-xl p-3 text-white mt-1.5 resize-none",
                  "placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none",
                  "transition-colors duration-150",
                )}
              />
            </div>

            {/* Deadline */}
            {task.type === "deadline" && (
              <div>
                <label className="text-[11px] text-zinc-500 uppercase tracking-wider font-medium">
                  Deadline
                </label>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={cn(
                    "w-full bg-zinc-800/80 border border-zinc-700/50 rounded-xl p-3 text-white mt-1.5",
                    "focus:border-zinc-600 focus:outline-none",
                    "transition-colors duration-150",
                  )}
                />
              </div>
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
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
