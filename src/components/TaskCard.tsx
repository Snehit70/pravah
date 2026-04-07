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

  // Determine the accent color based on status
  const getAccentColor = () => {
    if (isCompleted) return "#34D399"; // emerald
    if (isOverdue) return "#F87171"; // red
    if (isDueSoon) return "#FBBF24"; // amber/warning
    return "#E8A945"; // primary amber
  };

  const getAccentGlow = () => {
    if (isCompleted) return "rgba(52, 211, 153, 0.3)";
    if (isOverdue) return "rgba(248, 113, 113, 0.3)";
    if (isDueSoon) return "rgba(251, 191, 36, 0.3)";
    return "rgba(232, 169, 69, 0.2)";
  };

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
      initial={isDragOverlay ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={isDragOverlay ? undefined : {
        y: -3,
        transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
      }}
      className={cn(
        "group relative rounded-xl cursor-grab active:cursor-grabbing",
        "transition-shadow duration-200 select-none overflow-hidden",
        // Base styles
        "bg-zinc-800/90 backdrop-blur-sm",
        // Hover state
        "hover:bg-zinc-750",
        // Completed state
        isCompleted && "opacity-50 hover:opacity-60",
        // Drag overlay state
        isDragOverlay && "rotate-2 scale-105",
      )}
      style={{
        ...style,
        boxShadow: isDragOverlay
          ? `0 20px 40px rgba(0,0,0,0.4), 0 0 0 1px ${getAccentColor()}40`
          : `0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.03)`,
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{
          backgroundColor: getAccentColor(),
          boxShadow: `0 0 8px ${getAccentGlow()}`,
        }}
      />

      <div className="flex items-start gap-2.5 px-3 py-2.5 pl-4">
        {/* Status indicator */}
        <div
          className={cn(
            "mt-0.5 flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center",
            "transition-colors duration-150",
          )}
          style={{
            backgroundColor: `${getAccentColor()}20`,
            color: getAccentColor(),
          }}
        >
          {isCompleted ? (
            <Check size={10} strokeWidth={3} />
          ) : isOverdue ? (
            <AlertTriangle size={9} strokeWidth={2.5} />
          ) : task.type === "deadline" ? (
            <Clock size={9} strokeWidth={2.5} />
          ) : (
            <div
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: getAccentColor() }}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={cn(
              "text-[13px] leading-snug font-medium",
              isCompleted
                ? "line-through text-zinc-500"
                : "text-zinc-100",
            )}
          >
            {task.title}
          </p>

          {task.deadline && !isCompleted && (
            <p
              className="text-[11px] mt-1 font-medium"
              style={{
                color: isOverdue
                  ? "#F87171"
                  : isDueSoon
                    ? "#FBBF24"
                    : "#71717A"
              }}
            >
              {formatDeadline(task.deadline, today)}
            </p>
          )}

          {task.estimatedMinutes && !isCompleted && (
            <p className="text-[11px] mt-0.5 text-zinc-500">
              {task.estimatedMinutes}m
            </p>
          )}
        </div>
      </div>

      {/* Hover glow effect */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 20px ${getAccentGlow()}`,
        }}
      />
    </motion.div>
  );
}
