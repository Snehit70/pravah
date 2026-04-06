import { useState } from "react";
import { X, Plus } from "lucide-react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

interface QuickAddProps {
  onClose: () => void;
}

export function QuickAdd({ onClose }: QuickAddProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"open" | "deadline">("open");
  const [deadline, setDeadline] = useState("");
  
  const addTask = useMutation(api.tasks.addTask);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    await addTask({
      title: title.trim(),
      type,
      deadline: type === "deadline" ? deadline : undefined,
    });

    setTitle("");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-lg p-4 shadow-2xl">
        <form onSubmit={handleSubmit}>
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-zinc-800 rounded-lg">
              <Plus size={20} className="text-zinc-400" />
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="flex-1 bg-transparent text-lg text-white placeholder-zinc-500 outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-zinc-500 hover:text-zinc-300"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setType("open")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  type === "open"
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Open
              </button>
              <button
                type="button"
                onClick={() => setType("deadline")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  type === "deadline"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                Deadline
              </button>
            </div>

            {type === "deadline" && (
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
              />
            )}

            <div className="flex-1" />

            <button
              type="submit"
              disabled={!title.trim()}
              className="px-4 py-1.5 bg-white text-black rounded-lg text-sm font-medium hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Task
            </button>
          </div>

          <div className="text-xs text-zinc-600 mt-3">
            Press <kbd className="px-1 py-0.5 bg-zinc-800 rounded">Enter</kbd> to add,{" "}
            <kbd className="px-1 py-0.5 bg-zinc-800 rounded">Esc</kbd> to close
          </div>
        </form>
      </div>
    </div>
  );
}