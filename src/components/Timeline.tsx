import { useRef, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, Plus, Command } from "lucide-react";
import { DayColumn } from "./DayColumn";
import type { Task } from "../types";
import { cn, generateDateRange } from "../lib/utils";

interface TimelineProps {
  tasksByDate: Record<string, Task[]>;
  onTaskClick: (task: Task) => void;
  onOpenSettings?: () => void;
  onOpenQuickAdd?: () => void;
}

export function Timeline({
  tasksByDate,
  onTaskClick,
  onOpenSettings,
  onOpenQuickAdd,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  const dates = useMemo(() => generateDateRange(7, 14), []);
  const hasAnyTasks = Object.keys(tasksByDate).length > 0;

  // Scroll to today on mount
  useEffect(() => {
    if (todayRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const todayEl = todayRef.current;
      const scrollPos =
        todayEl.offsetLeft - container.clientWidth / 2 + todayEl.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, scrollPos), behavior: "instant" });
    }
  }, [dates]);

  const todayStr = dates.find((d) => {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    return d === today;
  });

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
        className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60"
      >
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight text-white">
            Pravah
          </h1>
          <span className="text-[10px] text-zinc-600 bg-zinc-800/80 px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
            beta
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onOpenQuickAdd && (
            <button
              onClick={onOpenQuickAdd}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm",
                "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60",
                "transition-colors duration-150",
              )}
            >
              <Plus size={15} />
              <span className="hidden sm:inline text-xs text-zinc-600">
                <Command size={11} className="inline -mt-px" />N
              </span>
            </button>
          )}

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              aria-label="Settings"
              className={cn(
                "p-2 rounded-lg",
                "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60",
                "transition-colors duration-150",
              )}
            >
              <SettingsIcon size={16} />
            </button>
          )}
        </div>
      </motion.header>

      {/* Timeline scroll area */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden relative" ref={scrollRef}>
        {!hasAnyTasks && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
          >
            <div className="text-center max-w-md px-6">
              <div className="mb-4 text-zinc-700">
                <Plus size={48} className="mx-auto mb-2" />
              </div>
              <h2 className="text-xl font-medium text-zinc-400 mb-2">
                Get started with Pravah
              </h2>
              <p className="text-sm text-zinc-600 mb-4">
                Add tasks to your inbox and drag them onto the timeline to schedule them.
              </p>
              <div className="flex flex-col gap-2 text-xs text-zinc-700">
                <div className="flex items-center justify-center gap-2">
                  <Command size={12} />
                  <span>Press</span>
                  <kbd className="px-2 py-1 bg-zinc-800/50 rounded font-mono">Cmd+N</kbd>
                  <span>to quickly add a task</span>
                </div>
                <div>Or use the + button in the inbox sidebar</div>
              </div>
            </div>
          </motion.div>
        )}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="flex px-4 py-4 min-w-max"
        >
          {dates.map((date) => (
            <div key={date} ref={date === todayStr ? todayRef : undefined}>
              <DayColumn
                date={date}
                tasks={tasksByDate[date] ?? []}
                onTaskClick={onTaskClick}
              />
            </div>
          ))}
        </motion.div>
      </div>

      {/* Footer hint */}
      <div className="px-6 py-2 border-t border-zinc-800/40">
        <p className="text-[11px] text-zinc-600 text-center">
          Drag tasks to reorder or move between days
        </p>
      </div>
    </div>
  );
}
