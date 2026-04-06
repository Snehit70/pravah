import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CheckCircle2 } from "lucide-react";
import type { Task } from "../types";

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
  isDragging?: boolean;
}

export function TaskCard({ task, onClick, isDragging }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: task._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isOverdue = task.type === "deadline" && task.deadline && task.deadline < new Date().toISOString().split("T")[0] && task.status !== "completed";
  const isDueSoon = task.type === "deadline" && task.deadline && !isOverdue && task.status !== "completed";

  const typeColor = task.type === "deadline" 
    ? isOverdue 
      ? "border-red-500/50" 
      : isDueSoon 
        ? "border-amber-500/50" 
        : "border-zinc-700/50"
    : "border-zinc-700/50";

  const accentColor = task.type === "deadline"
    ? isOverdue
      ? "bg-red-500/10"
      : isDueSoon
        ? "bg-amber-500/10"
        : ""
    : "bg-cyan-500/5";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        p-3 rounded-xl cursor-grab active:cursor-grabbing
        bg-zinc-800 hover:bg-zinc-750 border
        transition-colors select-none
        ${typeColor}
        ${accentColor}
        ${isDragging ? "opacity-50" : ""}
        ${task.status === "completed" ? "opacity-60" : ""}
      `}
    >
      <div className="flex items-start gap-2">
        {task.status === "completed" && (
          <CheckCircle2 size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className={`text-sm text-zinc-200 truncate ${task.status === "completed" ? "line-through" : ""}`}>
            {task.title}
          </div>
          {task.deadline && task.status !== "completed" && (
            <div className={`text-xs mt-1 ${isOverdue ? "text-red-400" : isDueSoon ? "text-amber-400" : "text-zinc-500"}`}>
              {isOverdue ? "Overdue" : `Due ${new Date(task.deadline).toLocaleDateString()}`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}