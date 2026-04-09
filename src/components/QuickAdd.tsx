import { useEffect, useId, useRef, useState } from "react";
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
  const [deadlineError, setDeadlineError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleInputId = useId();
  const titleErrorId = useId();
  const deadlineErrorId = useId();
  const submitErrorId = useId();
  const quickAddTitleId = useId();
  const quickAddDescriptionId = useId();

  const addTask = useMutation(api.tasks.addTask);
  const { showError, showSuccess } = useToast();
  const minDate = getLocalDateString();

  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmittingRef.current) onClose();

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "enter") {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }

      if (e.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      restoreFocusRef.current?.focus();
    };
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!title.trim()) {
      setTitleError("Title is required");
      return;
    }

    if (type === "deadline" && !deadline) {
      setDeadlineError("Deadline date is required");
      return;
    }

    setTitleError("");
    setDeadlineError("");
    setSubmitError("");

    try {
      setIsSubmitting(true);
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
      setSubmitError("Could not add task. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (!isSubmitting && e.target === e.currentTarget) onClose();
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
          "fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-24",
          "bg-black/60 backdrop-blur-sm"
        )}
        onClick={handleBackdropClick}
      >
        <motion.div
          ref={modalRef}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={modalVariants}
          transition={TRANSITION_OVERSHOOT}
          role="dialog"
          aria-modal="true"
          aria-labelledby={quickAddTitleId}
          aria-describedby={quickAddDescriptionId}
          className={cn(
            "w-full max-w-lg p-5 mx-0 sm:mx-4 md:mx-0",
            "bg-zinc-900 rounded-t-2xl sm:rounded-2xl",
            "border border-zinc-800/80",
            "shadow-2xl shadow-black/50"
          )}
        >
          <h2 id={quickAddTitleId} className="sr-only">Quick Add Task</h2>
          <p id={quickAddDescriptionId} className="sr-only">
            Create a new open task or deadline task.
          </p>
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
                const input = e.target as HTMLInputElement;
                if (input.type === "date") {
                  e.preventDefault();
                }
              }
            }}
          >
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
                  if (titleError && e.target.value.trim()) setTitleError("");
                }}
                placeholder="What needs to be done?"
                id={titleInputId}
                aria-invalid={Boolean(titleError)}
                aria-describedby={titleError ? titleErrorId : undefined}
                className={cn(
                  "flex-1 bg-transparent text-lg text-zinc-100",
                  "placeholder-zinc-600 outline-none"
                )}
                autoFocus
              />
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                aria-label="Close quick add"
                className={cn(
                  "p-2 rounded-lg",
                  "text-zinc-500 hover:text-zinc-300",
                  "hover:bg-zinc-800/60",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "transition-colors duration-150"
                )}
              >
                <X size={18} />
              </button>
            </div>

            {titleError && (
              <p id={titleErrorId} className="text-xs text-red-400 -mt-2 mb-2">{titleError}</p>
            )}

            <div className="flex items-center gap-3 text-sm">
              <div className={cn(
                "flex gap-1 p-1 rounded-xl",
                "bg-zinc-800/80"
              )}>
                <button
                  type="button"
                  onClick={() => {
                    setType("open");
                    setDeadlineError("");
                  }}
                  disabled={isSubmitting}
                  className={cn(
                    "px-3 py-1.5 rounded-lg",
                    "transition-all duration-150",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
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
                  disabled={isSubmitting}
                  className={cn(
                    "px-3 py-1.5 rounded-lg",
                    "transition-all duration-150",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
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
                    onChange={(e) => {
                      setDeadline(e.target.value);
                      if (deadlineError && e.target.value) setDeadlineError("");
                    }}
                    min={minDate}
                    disabled={isSubmitting}
                    aria-invalid={Boolean(deadlineError)}
                    aria-describedby={deadlineError ? deadlineErrorId : undefined}
                    className={cn(
                      "px-3 py-1.5 text-sm rounded-xl",
                      "bg-zinc-800/80 text-zinc-100",
                      "border border-zinc-700/50",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                      "focus:border-amber-500/50 focus:outline-none"
                    )}
                  />
                )}
              </AnimatePresence>

              <div className="flex-1" />

              <Button
                type="submit"
                disabled={!title.trim() || isSubmitting}
                variant="primary"
                size="sm"
              >
                {isSubmitting ? "Adding..." : "Add Task"}
              </Button>
            </div>

            {deadlineError && (
              <p id={deadlineErrorId} className="text-xs text-red-400 mt-2">
                {deadlineError}
              </p>
            )}

            {submitError && (
              <p id={submitErrorId} className="text-xs text-red-400 mt-2">
                {submitError}
              </p>
            )}

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
              <span className="flex items-center gap-1.5">
                <kbd className={cn(
                  "px-1.5 py-0.5 rounded-lg font-mono",
                  "bg-zinc-800/80 text-zinc-400 border border-zinc-700/50"
                )}>Ctrl/⌘ + Enter</kbd>
                <span>to submit</span>
              </span>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
