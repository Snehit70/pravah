import { useState } from "react";
import { X } from "lucide-react";
import type { Task } from "../types";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface TaskPopupProps {
  task: Task;
  onClose: () => void;
}

export function TaskPopup({ task, onClose }: TaskPopupProps) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description || "");
  const [deadline, setDeadline] = useState(task.deadline || "");
  
  const updateTask = useMutation(api.tasks.updateTask);
  const completeTask = useMutation(api.tasks.completeTask);
  const deleteTask = useMutation(api.tasks.deleteTask);

  const handleSave = async () => {
    await updateTask({
      taskId: task._id,
      title,
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
    await deleteTask({ taskId: task._id });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-white">Edit Task</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-zinc-500 uppercase">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white mt-1"
            />
          </div>

          <div>
            <label className="text-xs text-zinc-500 uppercase">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white mt-1 resize-none"
            />
          </div>

          {task.type === "deadline" && (
            <div>
              <label className="text-xs text-zinc-500 uppercase">Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white mt-1"
              />
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              onClick={handleComplete}
              className="flex-1 bg-zinc-700 hover:bg-zinc-600 text-white py-2 rounded-lg"
            >
              Complete
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 text-red-400 hover:text-red-300"
            >
              Delete
            </button>
            <button
              onClick={handleSave}
              className="flex-1 bg-white text-black hover:bg-zinc-200 py-2 rounded-lg"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}