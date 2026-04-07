import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Settings as SettingsIcon, Plus, Command } from "lucide-react";
import { DayColumn } from "./DayColumn";
import type { Task } from "../types";
import { cn, generateDateRange } from "../lib/utils";
import { Button } from "./Button";

interface TimelineProps {
  tasksByDate: Record<string, Task[]>;
  onTaskClick: (task: Task) => void;
  onOpenSettings?: () => void;
  onOpenQuickAdd?: () => void;
}

// Flow illustration SVG component for empty state
function FlowIllustration() {
  return (
    <motion.svg
      width="240"
      height="80"
      viewBox="0 0 240 80"
      fill="none"
      className="mx-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.8 }}
    >
      {/* Flow line */}
      <motion.path
        d="M20 40 Q 60 15, 120 40 T 220 40"
        stroke="url(#flowGradient)"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
      />
      {/* Gradient definition */}
      <defs>
        <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#71717A" stopOpacity="0.3" />
          <stop offset="50%" stopColor="#E8A945" stopOpacity="0.8" />
          <stop offset="100%" stopColor="#71717A" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      {/* Nodes along the flow */}
      <motion.circle
        cx="40"
        cy="28"
        r="4"
        fill="#52525B"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.6 }}
        transition={{ delay: 0.6, duration: 0.4 }}
      />
      <motion.circle
        cx="120"
        cy="40"
        r="8"
        fill="#E8A945"
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.3, 1] }}
        transition={{ delay: 1, duration: 0.6 }}
      />
      {/* Glow for center node */}
      <motion.circle
        cx="120"
        cy="40"
        r="8"
        fill="#E8A945"
        initial={{ scale: 1, opacity: 0.5 }}
        animate={{ scale: 2, opacity: 0 }}
        transition={{ delay: 1.2, duration: 1.5, repeat: Infinity }}
      />
      <motion.circle
        cx="200"
        cy="28"
        r="4"
        fill="#52525B"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.6 }}
        transition={{ delay: 1.4, duration: 0.4 }}
      />
    </motion.svg>
  );
}

export function Timeline({
  tasksByDate,
  onTaskClick,
  onOpenSettings,
  onOpenQuickAdd,
}: TimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

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

  // Pan/drag to scroll functionality
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 2) return; // Right-click only
    e.preventDefault();
    setIsPanning(true);
    setStartX(e.pageX - (scrollRef.current?.offsetLeft ?? 0));
    setScrollLeft(scrollRef.current?.scrollLeft ?? 0);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning) return;
    e.preventDefault();
    const x = e.pageX - (scrollRef.current?.offsetLeft ?? 0);
    const walk = (x - startX) * 1.5;
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollLeft - walk;
    }
  }, [isPanning, startX, scrollLeft]);

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Prevent context menu on right-click
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="h-full flex flex-col bg-zinc-950/90">
      {/* Header */}
      <motion.header
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "flex items-center justify-between px-6 h-14",
          "border-b border-zinc-800/60",
          "bg-zinc-950/80 backdrop-blur-md",
          "sticky top-0 z-50"
        )}
      >
        <div className="flex items-center gap-3">
          <h1
            className="text-lg font-semibold tracking-tight text-zinc-100"
            style={{ fontFamily: "'Newsreader', Georgia, serif" }}
          >
            Pravah
          </h1>
          <span className={cn(
            "text-[9px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider",
            "bg-amber-500/15 text-amber-400",
            "border border-amber-500/20"
          )}>
            beta
          </span>
        </div>

        <div className="flex items-center gap-1">
          {onOpenQuickAdd && (
            <button
              onClick={onOpenQuickAdd}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm",
                "text-zinc-500 hover:text-zinc-200",
                "hover:bg-zinc-800/60",
                "transition-all duration-200",
              )}
            >
              <Plus size={15} />
              <span className="hidden sm:flex items-center gap-1 text-xs text-zinc-600">
                <Command size={10} />N
              </span>
            </button>
          )}

          {onOpenSettings && (
            <button
              onClick={onOpenSettings}
              aria-label="Settings"
              className={cn(
                "p-2 rounded-xl",
                "text-zinc-500 hover:text-zinc-200",
                "hover:bg-zinc-800/60",
                "transition-all duration-200",
              )}
            >
              <SettingsIcon size={16} />
            </button>
          )}
        </div>
      </motion.header>

      {/* Timeline scroll area */}
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 overflow-x-auto overflow-y-hidden relative",
          isPanning && "cursor-grabbing select-none"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={handleContextMenu}
      >
        {/* Empty state */}
        {!hasAnyTasks && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none"
          >
            <div className="text-center max-w-md px-6">
              <div className="mb-8">
                <FlowIllustration />
              </div>
              <motion.h2
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="text-2xl font-medium text-zinc-200 mb-3"
                style={{ fontFamily: "'Newsreader', Georgia, serif" }}
              >
                Your timeline is clear
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="text-sm text-zinc-500 mb-8"
              >
                Add a task to start flowing through your day
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="pointer-events-auto"
              >
                <Button onClick={onOpenQuickAdd} variant="primary" size="md">
                  <Plus size={16} className="mr-2" />
                  Add Task
                </Button>
              </motion.div>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 }}
                className="flex items-center justify-center gap-2 text-xs text-zinc-600 mt-6"
              >
                <span>Press</span>
                <kbd className="px-2 py-1 bg-zinc-800/80 rounded-lg font-mono text-zinc-400 border border-zinc-700/50">
                  <Command size={10} className="inline -mt-px mr-0.5" />N
                </kbd>
                <span>to quickly add a task</span>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* Timeline days */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15 }}
          className="flex px-4 py-4 min-w-max gap-1"
        >
          {dates.map((date, index) => (
            <motion.div
              key={date}
              ref={date === todayStr ? todayRef : undefined}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.4 }}
            >
              <DayColumn
                date={date}
                tasks={tasksByDate[date] ?? []}
                onTaskClick={onTaskClick}
              />
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* Footer hint */}
      <div className="px-6 py-2 border-t border-zinc-800/40 bg-zinc-950/50">
        <p className="text-[11px] text-zinc-600 text-center">
          Drag tasks to reorder or move between days &bull; Right-click + drag to pan
        </p>
      </div>
    </div>
  );
}
