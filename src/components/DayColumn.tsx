import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence } from "framer-motion";
import { TaskCard } from "./TaskCard";
import type { Task } from "../types";
import { cn, getLocalDateString, formatDay } from "../lib/utils";

interface DayColumnProps {
  date: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function DayColumn({ date, tasks, onTaskClick }: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: date });

  const today = getLocalDateString();
  const { dayName, dayNum, monthShort } = formatDay(date);
  const isToday = date === today;
  const isPast = date < today;
  const isWeekend = [0, 6].includes(new Date(date + "T12:00:00").getDay());

  const openTasks = tasks.filter((t) => t.type === "open");
  const deadlineTasks = tasks.filter((t) => t.type === "deadline");
  const hasIncomplete = isPast && tasks.some((t) => t.status === "scheduled");

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-52 min-h-[280px] px-2 py-3 rounded-2xl transition-all duration-200",
        isOver && "bg-zinc-800/40 ring-1 ring-zinc-600/30",
        hasIncomplete && "ring-1 ring-red-500/30",
        isToday && "bg-zinc-800/20",
      )}
    >
      {/* Day header */}
      <div className={cn("text-center mb-4", isPast && !isToday && "opacity-50")}>
        <p
          className={cn(
            "text-[11px] uppercase tracking-wider font-medium",
            isToday ? "text-white" : isWeekend ? "text-zinc-600" : "text-zinc-500",
          )}
        >
          {dayName}
        </p>
        <div className="flex items-center justify-center gap-1.5 mt-0.5">
          <span
            className={cn(
              "text-xl font-semibold tabular-nums",
              isToday
                ? "text-white bg-white/10 w-9 h-9 rounded-full flex items-center justify-center"
                : isPast
                  ? "text-zinc-600"
                  : "text-zinc-300",
            )}
          >
            {dayNum}
          </span>
          {hasIncomplete && (
            <span
              className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"
              title="Incomplete tasks"
            />
          )}
        </div>
        {/* Show month label on 1st of month or first visible date */}
        {dayNum === 1 && (
          <p className="text-[10px] text-zinc-500 mt-0.5 uppercase tracking-wider">
            {monthShort}
          </p>
        )}
      </div>

      {/* Open tasks (above the line) */}
      <div className="flex flex-col gap-1.5 min-h-[40px]">
        <SortableContext
          items={openTasks.map((t) => t._id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence mode="popLayout">
            {openTasks.map((task) => (
              <TaskCard
                key={task._id}
                task={task}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
      </div>

      {/* Timeline divider */}
      <div className="relative my-3 flex items-center">
        <div
          className={cn(
            "flex-1 h-px",
            isToday ? "bg-zinc-500" : "bg-zinc-800",
          )}
        />
        <div
          className={cn(
            "w-2 h-2 rounded-full mx-1 flex-shrink-0",
            isToday
              ? "bg-white shadow-[0_0_8px_rgba(255,255,255,0.3)]"
              : isPast
                ? "bg-zinc-700"
                : "bg-zinc-700",
          )}
        />
        <div
          className={cn(
            "flex-1 h-px",
            isToday ? "bg-zinc-500" : "bg-zinc-800",
          )}
        />
      </div>

      {/* Deadline tasks (below the line) */}
      <div className="flex flex-col gap-1.5 min-h-[40px]">
        <SortableContext
          items={deadlineTasks.map((t) => t._id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence mode="popLayout">
            {deadlineTasks.map((task) => (
              <TaskCard
                key={task._id}
                task={task}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
      </div>
    </div>
  );
}
