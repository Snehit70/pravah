import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AnimatePresence, motion } from "framer-motion";
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
        "flex-shrink-0 w-44 min-h-[360px] px-3 py-4 rounded-2xl relative",
        "transition-all duration-300",
        // Drop zone highlight
        isOver && "bg-amber-500/10 ring-2 ring-amber-500/40",
        // Incomplete tasks warning
        hasIncomplete && !isOver && "ring-1 ring-red-500/40",
      )}
      style={isToday ? {
        background: 'radial-gradient(ellipse at top, rgba(232, 169, 69, 0.15) 0%, transparent 70%)',
      } : undefined}
    >
      {/* Ambient glow for today */}
      {isToday && (
        <div
          className="absolute inset-0 rounded-2xl pointer-events-none"
          style={{
            boxShadow: 'inset 0 0 60px rgba(232, 169, 69, 0.08)',
          }}
        />
      )}

      {/* Day header */}
      <div className={cn("text-center mb-5 relative z-10", isPast && !isToday && "opacity-40")}>
        <p
          className={cn(
            "text-[10px] uppercase tracking-[0.15em] font-semibold mb-1",
            isToday ? "text-amber-400" : isWeekend ? "text-zinc-600" : "text-zinc-500",
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
            animate={isToday ? { scale: [1, 1.03, 1] } : undefined}
            transition={isToday ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : undefined}
          >
            {isToday && (
              <>
                {/* Outer glow ring */}
                <motion.div
                  className="absolute inset-0 rounded-full bg-amber-500"
                  animate={{ scale: [1, 1.3], opacity: [0.3, 0] }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
                />
                {/* Main circle */}
                <div
                  className="absolute inset-0 rounded-full bg-amber-500"
                  style={{ boxShadow: '0 0 20px rgba(232, 169, 69, 0.5), 0 0 40px rgba(232, 169, 69, 0.2)' }}
                />
              </>
            )}
            <span
              className={cn(
                "relative z-10 text-2xl font-semibold tabular-nums",
                isToday
                  ? "text-zinc-900"
                  : isPast
                    ? "text-zinc-600"
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
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              title="Incomplete tasks"
            />
          )}
        </div>
        {/* Show month label on 1st of month */}
        {dayNum === 1 && (
          <p className="text-[9px] text-zinc-600 mt-1 uppercase tracking-[0.15em] font-medium">
            {monthShort}
          </p>
        )}
      </div>

      {/* Open tasks (above the line) */}
      <div className="flex flex-col gap-2 min-h-[60px] relative z-10">
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

      {/* Flow line divider - the visual thread of time */}
      <div className="relative my-5 flex items-center">
        <div
          className={cn(
            "flex-1 h-[2px] rounded-full",
            isToday ? "bg-gradient-to-r from-transparent via-amber-500/60 to-amber-500/60" : "bg-zinc-800",
          )}
        />
        <motion.div
          className={cn(
            "relative mx-2 flex-shrink-0",
          )}
        >
          {/* Outer pulse for today */}
          {isToday && (
            <motion.div
              className="absolute inset-0 w-4 h-4 -m-1 rounded-full bg-amber-500"
              animate={{ scale: [1, 2], opacity: [0.4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          {/* Main dot */}
          <div
            className={cn(
              "w-2.5 h-2.5 rounded-full",
              isToday
                ? "bg-amber-500 shadow-[0_0_10px_rgba(232,169,69,0.8)]"
                : isPast
                  ? "bg-zinc-700"
                  : "bg-zinc-600",
            )}
          />
        </motion.div>
        <div
          className={cn(
            "flex-1 h-[2px] rounded-full",
            isToday ? "bg-gradient-to-l from-transparent via-amber-500/60 to-amber-500/60" : "bg-zinc-800",
          )}
        />
      </div>

      {/* Deadline tasks (below the line) */}
      <div className="flex flex-col gap-2 min-h-[60px] relative z-10">
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
