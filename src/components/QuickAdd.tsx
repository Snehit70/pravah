import { useState, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../convex/_generated/api";
import { cn } from "../lib/utils";

interface QuickAddProps {
  onClose: () => void;
}

export function QuickAdd({ onClose }: QuickAddProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"open" | "deadline">("open");
  const [deadline, setDeadline] = useState("");

  const addTask = useMutation(api.tasks.addTask);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ type: "spring", duration: 0.3, bounce: 0.1 }}
          className="bg-zinc-900 border border-zinc-700/50 rounded-2xl w-full max-w-lg p-5 shadow-2xl"
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 bg-zinc-800 rounded-xl">
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
                className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <div className="flex gap-1 p-1 bg-zinc-800/50 rounded-lg">
                <button
                  type="button"
                  onClick={() => setType("open")}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-all",
                    type === "open"
                      ? "bg-cyan-500/20 text-cyan-400 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => setType("deadline")}
                  className={cn(
                    "px-3 py-1.5 rounded-md transition-all",
                    type === "deadline"
                      ? "bg-amber-500/20 text-amber-400 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  Deadline
                </button>
              </div>

              <AnimatePresence>
                {type === "deadline" && (
                  <motion.input
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: "auto" }}
                    exit={{ opacity: 0, width: 0 }}
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white"
                  />
                )}
              </AnimatePresence>

              <div className="flex-1" />

              <motion.button
                type="submit"
                disabled={!title.trim()}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="px-4 py-1.5 bg-white text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Add Task
              </motion.button>
            </div>

            <div className="flex items-center gap-4 text-xs text-zinc-600 mt-4 pt-3 border-t border-zinc-800">
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500 font-mono">Enter</kbd>
                <span>to add</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="px-1.5 py-0.5 bg-zinc-800 rounded text-zinc-500 font-mono">Esc</kbd>
                <span>to close</span>
              </span>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
