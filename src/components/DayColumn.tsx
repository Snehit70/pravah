import { useDroppable } from "@dnd-kit/core";
import { useSortable, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { memo, useState } from "react";
import type { Task } from "../types";
import { cn, getLocalDateString, formatDay, daysBetween, DUE_SOON_DAYS } from "../lib/utils";

// A lightweight, chrome-free task preview — just a status dot + truncated title
// Uses useSortable so DnD kit properly handles click vs drag distinction
function TaskPreview({ task, today, onClick }: { task: Task; today: string; onClick: () => void }) {
  const { setNodeRef, attributes, listeners, transform, transition, isDragging } = useSortable({
    id: task._id,
  });

  const isCompleted = task.status === "completed";
  const isOverdue =
    task.type === "deadline" && !!task.deadline && task.deadline < today && !isCompleted;
  const isDueSoon =
    task.type === "deadline" &&
    !!task.deadline &&
    !isOverdue &&
    !isCompleted &&
    daysBetween(today, task.deadline) <= DUE_SOON_DAYS;

  const dotColor = isCompleted
    ? "#34D399"
    : isOverdue
      ? "#F87171"
      : isDueSoon
        ? "#FBBF24"
        : "#0075de";

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={task.title}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "w-full flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer",
        "hover:bg-zinc-800 transition-colors duration-150"
      )}
    >
      <span
        className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
        style={{ background: dotColor }}
      />
      <span
        className={cn(
          "text-[12px] font-medium truncate leading-tight",
          isCompleted
            ? "line-through text-zinc-500"
            : isOverdue
              ? "text-red-400"
              : "text-zinc-300"
        )}
      >
        {task.title}
      </span>
    </motion.div>
  );
}

interface DayColumnProps {
  date: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

function DayColumnComponent({ date, tasks, onTaskClick }: DayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const shouldReduceMotion = useReducedMotion();
  const [openExpanded, setOpenExpanded] = useState(false);
  const [deadlineExpanded, setDeadlineExpanded] = useState(false);

  const today = getLocalDateString();
  const { dayName, dayNum, monthShort } = formatDay(date);
  const isToday = date === today;
  const isPast = date < today;
  const isWeekend = [0, 6].includes(new Date(date + "T12:00:00").getDay());

  const openTasks = tasks.filter((t) => t.type === "open");
  const deadlineTasks = tasks.filter((t) => t.type === "deadline");
  const hasIncomplete = isPast && tasks.some((t) => t.status === "scheduled");

  const previewOpen = openTasks.slice(0, 1);
  const previewDeadline = deadlineTasks.slice(0, 1);
  const visibleOpenTasks = openExpanded ? openTasks : previewOpen;
  const visibleDeadlineTasks = deadlineExpanded ? deadlineTasks : previewDeadline;
  const hiddenOpenCount = openTasks.length - visibleOpenTasks.length;
  const hiddenDeadlineCount = deadlineTasks.length - visibleDeadlineTasks.length;

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-44 min-h-[360px] px-3 py-4 rounded-2xl relative",
        "bg-[#252525] border border-white/10",
        "transition-all duration-300",
        // Drop zone highlight
        isOver && "bg-blue-500/15 ring-1 ring-blue-400/50",
        // Incomplete tasks warning
        hasIncomplete && !isOver && "ring-1 ring-red-500/40",
      )}
      style={isToday ? {
        background: "linear-gradient(180deg, rgba(35,131,226,0.16) 0%, rgba(35,131,226,0.04) 28%, #252525 72%)",
      } : undefined}
    >
      {/* Day header */}
      <div className={cn("text-center mb-5 relative z-10", isPast && !isToday && "opacity-40")}>
        <p
          className={cn(
            "text-[10px] uppercase tracking-[0.15em] font-semibold mb-1",
            isToday ? "text-blue-300" : isWeekend ? "text-zinc-500" : "text-zinc-400",
          )}
        >
          {dayName}
        </p>
        <div className="flex items-center justify-center gap-2">
          <motion.div
            className={cn(
              "relative flex items-center justify-center",
              isToday && "w-11 h-11"
            )}
            animate={isToday && !shouldReduceMotion ? { scale: [1, 1.03, 1] } : undefined}
            transition={
              isToday && !shouldReduceMotion
                ? { duration: 3, repeat: Infinity, ease: "easeInOut" }
                : undefined
            }
          >
            {isToday && <div className="absolute inset-0 rounded-full bg-blue-500" />}
            <span
              className={cn(
                "relative z-10 text-2xl font-semibold tabular-nums",
                isToday
                  ? "text-white"
                  : isPast
                    ? "text-zinc-500"
                    : "text-zinc-200",
              )}
              style={!isToday ? undefined : { fontFamily: "'Newsreader', Georgia, serif", fontWeight: 500 }}
            >
              {dayNum}
            </span>
          </motion.div>
          {hasIncomplete && (
            <motion.span
              className="w-2 h-2 bg-red-500 rounded-full"
              animate={shouldReduceMotion ? undefined : { opacity: [1, 0.5, 1] }}
              transition={shouldReduceMotion ? undefined : { duration: 1.5, repeat: Infinity }}
              title="Incomplete tasks"
            />
          )}
        </div>
        {/* Show month label on 1st of month */}
        {dayNum === 1 && (
          <p className="text-[9px] text-zinc-400 mt-1 uppercase tracking-[0.15em] font-medium">
            {monthShort}
          </p>
        )}
      </div>

      {/* Open tasks (above the line) */}
      <div className="flex flex-col gap-1 min-h-[60px] relative z-10">
        <SortableContext
          items={visibleOpenTasks.map((t) => t._id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence mode="popLayout">
            {visibleOpenTasks.map((task) => (
              <TaskPreview
                key={task._id}
                task={task}
                today={today}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
        {(hiddenOpenCount > 0 || openExpanded) && (
          <motion.button
            type="button"
            onClick={() => setOpenExpanded((value) => !value)}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 4 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            className={cn(
              "text-[11px] font-medium px-2 py-1",
              "text-zinc-400 hover:text-zinc-200 rounded-md text-left transition-colors duration-150"
            )}
          >
            {openExpanded ? "Show less" : `+${hiddenOpenCount} more`}
          </motion.button>
        )}
      </div>

      {/* Flow line divider - the visual thread of time */}
      <div className="relative my-5 flex items-center">
        <div
          className={cn(
            "flex-1 h-[2px] rounded-full",
            isToday ? "bg-gradient-to-r from-zinc-700 via-blue-400/70 to-blue-400/70" : "bg-zinc-700",
          )}
        />
        <motion.div
          className={cn(
            "relative mx-2 flex-shrink-0",
          )}
        >
          {/* Main dot */}
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-full",
              isToday
                ? "bg-blue-500"
                : isPast
                  ? "bg-zinc-600"
                  : "bg-zinc-500",
            )}
          />
        </motion.div>
        <div
          className={cn(
            "flex-1 h-[2px] rounded-full",
            isToday ? "bg-gradient-to-l from-zinc-700 via-blue-400/70 to-blue-400/70" : "bg-zinc-700",
          )}
        />
      </div>

      {/* Deadline tasks (below the line) */}
      <div className="flex flex-col gap-1 min-h-[60px] relative z-10">
        <SortableContext
          items={visibleDeadlineTasks.map((t) => t._id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence mode="popLayout">
            {visibleDeadlineTasks.map((task) => (
              <TaskPreview
                key={task._id}
                task={task}
                today={today}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
        {(hiddenDeadlineCount > 0 || deadlineExpanded) && (
          <motion.button
            type="button"
            onClick={() => setDeadlineExpanded((value) => !value)}
            initial={shouldReduceMotion ? undefined : { opacity: 0, y: 4 }}
            animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
            className={cn(
              "text-[11px] font-medium px-2 py-1",
              "text-zinc-400 hover:text-zinc-200 rounded-md text-left transition-colors duration-150"
            )}
          >
            {deadlineExpanded ? "Show less" : `+${hiddenDeadlineCount} more`}
          </motion.button>
        )}
      </div>
    </div>
  );
}

export const DayColumn = memo(DayColumnComponent);
DayColumn.displayName = "DayColumn";
