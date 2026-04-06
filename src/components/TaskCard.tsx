import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import { Check, Clock, AlertTriangle } from "lucide-react";
import type { Task } from "../types";
import { cn, getLocalDateString, daysBetween, formatDeadline, DUE_SOON_DAYS } from "../lib/utils";

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  isDragOverlay?: boolean;
}

export function TaskCard({ task, onClick, isDragOverlay }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id, disabled: isDragOverlay });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const today = getLocalDateString();
  const isCompleted = task.status === "completed";
  const isOverdue =
    task.type === "deadline" &&
    !!task.deadline &&
    task.deadline < today &&
    !isCompleted;
  const isDueSoon =
    task.type === "deadline" &&
    !!task.deadline &&
    !isOverdue &&
    !isCompleted &&
    daysBetween(today, task.deadline) <= DUE_SOON_DAYS;

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      layout={!isDragOverlay}
      initial={isDragOverlay ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "group relative px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing",
        "border transition-all duration-150 select-none",
        // Base styles
        "bg-zinc-800/80 border-zinc-700/40",
        // Hover
        "hover:bg-zinc-700/60 hover:border-zinc-600/50",
        // Status colors
        isOverdue && "border-red-500/40 bg-red-950/30 hover:bg-red-950/40",
        isDueSoon && "border-amber-500/30 bg-amber-950/20 hover:bg-amber-950/30",
        !isOverdue && !isDueSoon && task.type === "open" && !isCompleted && "border-zinc-700/40",
        // Completed
        isCompleted && "opacity-50 hover:opacity-60",
        // Drag overlay
        isDragOverlay && "shadow-2xl shadow-black/50 ring-1 ring-white/10 rotate-2 scale-105",
      )}
    >
      <div className="flex items-start gap-2.5">
        {/* Status indicator */}
        <div
          className={cn(
            "mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center",
            "transition-colors duration-150",
            isCompleted && "bg-emerald-500/20 text-emerald-400",
            isOverdue && !isCompleted && "bg-red-500/20 text-red-400",
            isDueSoon && !isCompleted && "bg-amber-500/20 text-amber-400",
            !isCompleted && !isOverdue && !isDueSoon && "bg-zinc-700/50 text-zinc-500",
          )}
        >
          {isCompleted ? (
            <Check size={10} strokeWidth={3} />
          ) : isOverdue ? (
            <AlertTriangle size={9} strokeWidth={2.5} />
          ) : task.type === "deadline" ? (
            <Clock size={9} strokeWidth={2.5} />
          ) : (
            <div className="w-1.5 h-1.5 rounded-full bg-current" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-[13px] leading-tight text-zinc-200",
              isCompleted && "line-through text-zinc-500",
            )}
          >
            {task.title}
          </p>

          {task.deadline && !isCompleted && (
            <p
              className={cn(
                "text-[11px] mt-1 font-medium",
                isOverdue && "text-red-400",
                isDueSoon && "text-amber-400",
                !isOverdue && !isDueSoon && "text-zinc-500",
              )}
            >
              {formatDeadline(task.deadline, today)}
            </p>
          )}

          {task.estimatedMinutes && !isCompleted && (
            <p className="text-[11px] mt-0.5 text-zinc-600">
              {task.estimatedMinutes}m
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
