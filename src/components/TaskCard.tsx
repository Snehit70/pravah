import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      className={`
        p-3 rounded-xl cursor-grab active:cursor-grabbing
        bg-zinc-800 hover:bg-zinc-750 border border-zinc-700/50
        transition-colors select-none
        ${isDragging ? "opacity-50" : ""}
        ${task.status === "completed" ? "opacity-50" : ""}
      `}
    >
      <div className="text-sm text-zinc-200 truncate">{task.title}</div>
      {task.deadline && (
        <div className="text-xs text-zinc-500 mt-1">
          Due {new Date(task.deadline).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}