import { memo, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Inbox, ChevronLeft, ChevronRight, Settings as SettingsIcon } from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TRANSITION_FAST, TRANSITION_PANEL } from "../lib/motion";
import type { Task } from "../types";
import { cn } from "../lib/utils";
import { INBOX_DROP_ID } from "../lib/taskRules";

interface InboxSidebarProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onOpenQuickAdd?: () => void;
  onOpenSettings?: () => void;
}

function InboxTaskComponent({ task, onClick }: { task: Task; onClick: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const accentColor = task.type === "deadline" ? "#dd5b00" : "#0075de";
  const accentGlow = task.type === "deadline"
    ? "rgba(221, 91, 0, 0.18)"
    : "rgba(0, 117, 222, 0.18)";

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: isDragging ? 0.4 : 1, x: 0 }}
      exit={{ opacity: 0, x: -10, scale: 0.95 }}
      whileHover={{
        y: -2,
        transition: TRANSITION_FAST
      }}
      className={cn(
        "group relative rounded-xl cursor-grab active:cursor-grabbing",
        "bg-[#252525] overflow-hidden border border-white/10",
        "transition-shadow duration-200",
      )}
      style={{
        ...style,
        boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
      }}
    >
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
        style={{
          backgroundColor: accentColor,
          boxShadow: `0 0 8px ${accentGlow}`,
        }}
      />

      <div className="px-3 py-2.5 pl-4">
        <p className="text-[13px] text-zinc-100 font-medium truncate">{task.title}</p>
        {task.type === "deadline" && (
          <p className="text-[11px] text-orange-300 mt-0.5 font-medium">Deadline task</p>
        )}
      </div>

      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 16px ${accentGlow}`,
        }}
      />
    </motion.div>
  );
}

const InboxTask = memo(InboxTaskComponent);
InboxTask.displayName = "InboxTask";

function InboxSidebarComponent({
  tasks,
  onTaskClick,
  onOpenQuickAdd,
  onOpenSettings,
}: InboxSidebarProps) {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth < 768);
  const { setNodeRef, isOver } = useDroppable({ id: INBOX_DROP_ID });

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767.98px)");
    setCollapsed(mql.matches);
    const onChange = (event: MediaQueryListEvent) => setCollapsed(event.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return (
    <motion.aside
      ref={setNodeRef}
      initial={false}
      animate={{ width: collapsed ? 56 : 260 }}
      transition={TRANSITION_PANEL}
      className={cn(
        "relative flex flex-col overflow-hidden flex-shrink-0 h-full",
        "bg-[#202020] backdrop-blur-xl",
        "border-l border-white/10",
        isOver && "ring-1 ring-blue-400/50 bg-blue-500/10"
      )}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Expand inbox" : "Collapse inbox"}
        className={cn(
          "absolute top-3 z-10 p-1.5 rounded-lg",
          "text-zinc-400 hover:text-zinc-100",
          "hover:bg-zinc-800",
          "transition-all duration-200",
          collapsed ? "right-1.5" : "right-2",
        )}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {collapsed ? (
        /* Collapsed state */
        <div className="flex flex-col h-full">
          <div className="flex flex-col items-center pt-4 gap-3">
            {tasks.length > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className={cn(
                  "text-[10px] font-semibold rounded-full w-5 h-5 flex items-center justify-center",
                  "bg-blue-500/20 text-blue-300"
                )}
              >
                {tasks.length}
              </motion.span>
            )}
          </div>

          <div className="mt-auto p-2 border-t border-white/10 space-y-2">
            <button
              onClick={() => {
                setCollapsed(false);
                onOpenQuickAdd?.();
              }}
              aria-label="Create new task"
              className={cn(
                "w-full p-2 rounded-xl flex items-center justify-center",
                "bg-blue-500/15 hover:bg-blue-500/25",
                "text-blue-300 hover:text-blue-200",
                "border border-blue-400/25 hover:border-blue-300/40",
                "transition-all duration-200",
              )}
            >
              <Plus size={14} className="mx-auto" />
            </button>
            <button
              onClick={onOpenSettings}
              aria-label="Open settings"
              className={cn(
                "w-full p-2 rounded-xl flex items-center justify-center",
                "bg-zinc-900 hover:bg-zinc-800",
                "text-zinc-300 hover:text-zinc-100",
                "border border-white/10 hover:border-white/20",
                "transition-all duration-200",
              )}
            >
              <SettingsIcon size={14} className="mx-auto" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="p-4 pb-3 pr-10 border-b border-white/10">
            <div className="flex min-w-0 items-center gap-2 text-zinc-300">
              <Inbox size={15} />
              <span className="min-w-0 text-sm font-medium truncate">Inbox</span>
              {tasks.length > 0 && (
                <span className="shrink-0 text-[11px] text-blue-300 font-semibold tabular-nums bg-blue-500/20 px-1.5 py-0.5 rounded-full">
                  {tasks.length}
                </span>
              )}
            </div>
          </div>

          {/* Task list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <SortableContext
              items={tasks.map((task) => task._id)}
              strategy={verticalListSortingStrategy}
            >
              <AnimatePresence mode="popLayout">
                {tasks.map((task) => (
                  <InboxTask
                    key={task._id}
                    task={task}
                    onClick={() => onTaskClick(task)}
                  />
                ))}
              </AnimatePresence>
            </SortableContext>

            {tasks.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center py-12"
              >
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-800 flex items-center justify-center">
                  <Inbox size={20} className="text-zinc-400" />
                </div>
                <p className="text-sm text-zinc-300 font-medium">No tasks in inbox</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Add tasks here to sort them later
                </p>
              </motion.div>
            )}
          </div>

          <div className="p-3 pt-2 border-t border-white/10 grid grid-cols-[1fr_auto] gap-2">
            <button
              onClick={onOpenQuickAdd}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm",
                "bg-blue-500/15 hover:bg-blue-500/25",
                "text-blue-300 hover:text-blue-200",
                "border border-blue-400/25 hover:border-blue-300/40",
                "transition-all duration-200",
              )}
            >
              <Plus size={15} />
              New Task
            </button>
            <button
              onClick={onOpenSettings}
              aria-label="Open settings"
              className={cn(
                "px-3 rounded-xl flex items-center justify-center",
                "bg-zinc-900 hover:bg-zinc-800",
                "text-zinc-300 hover:text-zinc-100",
                "border border-white/10 hover:border-white/20",
                "transition-all duration-200",
              )}
            >
              <SettingsIcon size={15} />
            </button>
          </div>
        </>
      )}
    </motion.aside>
  );
}

export const InboxSidebar = memo(InboxSidebarComponent);
InboxSidebar.displayName = "InboxSidebar";
