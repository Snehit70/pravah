import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { TaskCard } from "./TaskCard";
import type { Task } from "../types";

interface DayColumnProps {
  date: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function DayColumn({ date, tasks, onTaskClick }: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  
  const today = new Date().toISOString().split("T")[0];
  const dateObj = new Date(date);
  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
  const dayNum = dateObj.getDate();
  const isToday = date === today;
  const isPast = date < today;
  
  const openTasks = tasks.filter((t) => t.type === "open");
  const deadlineTasks = tasks.filter((t) => t.type === "deadline");
  
  // Check for incomplete tasks in past days
  const hasIncomplete = isPast && tasks.some((t) => t.status === "scheduled");

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-48 min-h-[200px] mx-2 rounded-xl transition-colors ${
        isOver ? "bg-zinc-800/30" : "bg-transparent"
      } ${hasIncomplete ? "ring-1 ring-red-500/50" : ""}`}
    >
      <div className={`text-center py-2 mb-3 ${isToday ? "text-white" : isPast ? "text-zinc-600" : "text-zinc-500"}`}>
        <div className="text-xs uppercase">{dayName}</div>
        <div className="text-lg font-medium flex items-center justify-center gap-1">
          {dayNum}
          {hasIncomplete && (
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full" title="Incomplete tasks" />
          )}
        </div>
      </div>

      {/* Above the line - Open tasks */}
      <div className="flex flex-col gap-1 mb-1">
        <SortableContext items={openTasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
          {openTasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </SortableContext>
      </div>

      {/* Timeline line */}
      <div className="relative h-0.5 bg-zinc-700 mx-1 my-2">
        <div className="absolute -top-1.5 left-1/2 w-3 h-3 bg-zinc-700 rounded-full" />
      </div>

      {/* Below the line - Deadline tasks */}
      <div className="flex flex-col gap-1 mt-1">
        <SortableContext items={deadlineTasks.map((t) => t._id)} strategy={verticalListSortingStrategy}>
          {deadlineTasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}