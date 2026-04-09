import { useState, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { useMutation } from "convex/react";
import { motion, AnimatePresence } from "framer-motion";
import { api } from "../../convex/_generated/api";
import { TRANSITION_FAST, TRANSITION_OVERSHOOT } from "../lib/motion";
import { cn, getLocalDateString } from "../lib/utils";
import { Button } from "./Button";
import { useToast } from "./useToast";

interface QuickAddProps {
  onClose: () => void;
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -10 },
};

export function QuickAdd({ onClose }: QuickAddProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"open" | "deadline">("open");
  const [deadline, setDeadline] = useState("");
  const [titleError, setTitleError] = useState("");

  const addTask = useMutation(api.tasks.addTask);
  const { showError, showSuccess } = useToast();
  const minDate = getLocalDateString();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setTitleError("Title is required");
      return;
    }
    setTitleError("");

    try {
      await addTask({
        title: title.trim(),
        type,
        deadline: type === "deadline" ? deadline : undefined,
      });

      showSuccess("Task added!");
      setTitle("");
      onClose();
    } catch {
      showError("Failed to add task");
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={overlayVariants}
        transition={TRANSITION_FAST}
        className={cn(
          "fixed inset-0 z-50 flex items-start justify-center pt-24",
          "bg-black/60 backdrop-blur-sm"
        )}
        onClick={handleBackdropClick}
      >
        <motion.div
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={modalVariants}
          transition={TRANSITION_OVERSHOOT}
          className={cn(
            "w-full max-w-lg p-5 mx-4 md:mx-0",
            "bg-zinc-900 rounded-2xl",
            "border border-zinc-800/80",
            "shadow-2xl shadow-black/50"
          )}
        >
          <form onSubmit={handleSubmit}>
            <div className="flex items-center gap-3 mb-4">
              <div className={cn(
                "p-2.5 rounded-xl",
                "bg-amber-500/15"
              )}>
                <Plus size={20} className="text-amber-500" />
              </div>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (titleError) setTitleError("");
                }}
                placeholder="What needs to be done?"
                className={cn(
                  "flex-1 bg-transparent text-lg text-zinc-100",
                  "placeholder-zinc-600 outline-none"
                )}
                autoFocus
              />
              <button
                type="button"
                onClick={onClose}
                aria-label="Close quick add"
                className={cn(
                  "p-2 rounded-lg",
                  "text-zinc-500 hover:text-zinc-300",
                  "hover:bg-zinc-800/60",
                  "transition-colors duration-150"
                )}
              >
                <X size={18} />
              </button>
            </div>

            {titleError && (
              <p className="text-xs text-red-400 -mt-2 mb-2">{titleError}</p>
            )}

            <div className="flex items-center gap-3 text-sm">
              <div className={cn(
                "flex gap-1 p-1 rounded-xl",
                "bg-zinc-800/80"
              )}>
                <button
                  type="button"
                  onClick={() => setType("open")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg",
                    "transition-all duration-150",
                    type === "open"
                      ? "bg-amber-500/20 text-amber-400 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-400"
                  )}
                >
                  Open
                </button>
                <button
                  type="button"
                  onClick={() => setType("deadline")}
                  className={cn(
                    "px-3 py-1.5 rounded-lg",
                    "transition-all duration-150",
                    type === "deadline"
                      ? "bg-yellow-500/20 text-yellow-400 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-400"
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
                    transition={TRANSITION_FAST}
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    min={minDate}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-xl",
                      "bg-zinc-800/80 text-zinc-100",
                      "border border-zinc-700/50",
                      "focus:border-amber-500/50 focus:outline-none"
                    )}
                  />
                )}
              </AnimatePresence>

              <div className="flex-1" />

              <Button
                type="submit"
                disabled={!title.trim()}
                variant="primary"
                size="sm"
              >
                Add Task
              </Button>
            </div>

            <div className={cn(
              "flex items-center gap-4 text-xs mt-4 pt-3",
              "text-zinc-600",
              "border-t border-zinc-800/60"
            )}>
              <span className="flex items-center gap-1.5">
                <kbd className={cn(
                  "px-1.5 py-0.5 rounded-lg font-mono",
                  "bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
                )}>Enter</kbd>
                <span>to add</span>
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className={cn(
                  "px-1.5 py-0.5 rounded-lg font-mono",
                  "bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
                )}>Esc</kbd>
                <span>to close</span>
              </span>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
