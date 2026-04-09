import { memo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TRANSITION_FAST, TRANSITION_PANEL } from "../lib/motion";
import type { Task } from "../types";
import { cn } from "../lib/utils";

interface InboxSidebarProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onOpenQuickAdd?: () => void;
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

  const accentColor = task.type === "deadline" ? "#FBBF24" : "#E8A945";
  const accentGlow = task.type === "deadline"
    ? "rgba(251, 191, 36, 0.2)"
    : "rgba(232, 169, 69, 0.2)";

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
        "bg-zinc-800/80 backdrop-blur-sm overflow-hidden",
        "transition-shadow duration-200",
      )}
      style={{
        ...style,
        boxShadow: `0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.03)`,
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
          <p className="text-[11px] text-amber-400/70 mt-0.5 font-medium">Deadline task</p>
        )}
      </div>

      {/* Hover glow */}
      <div
        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
        style={{
          boxShadow: `inset 0 0 20px ${accentGlow}`,
        }}
      />
    </motion.div>
  );
}

const InboxTask = memo(InboxTaskComponent);
InboxTask.displayName = "InboxTask";

function InboxSidebarComponent({ tasks, onTaskClick, onOpenQuickAdd }: InboxSidebarProps) {
  const [collapsed, setCollapsed] = useState(window.innerWidth < 768);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 56 : 260 }}
      transition={TRANSITION_PANEL}
      className={cn(
        "relative flex flex-col overflow-hidden flex-shrink-0 h-full",
        "bg-zinc-950/40 backdrop-blur-xl",
        "border-l border-zinc-800/50"
      )}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Expand inbox" : "Collapse inbox"}
        className={cn(
          "absolute top-3 z-10 p-1.5 rounded-lg",
          "text-zinc-500 hover:text-zinc-300",
          "hover:bg-zinc-800/60",
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
                  "bg-amber-500/20 text-amber-400"
                )}
              >
                {tasks.length}
              </motion.span>
            )}
          </div>

          <div className="mt-auto p-2 border-t border-zinc-800/60">
            <button
              onClick={() => {
                setCollapsed(false);
                onOpenQuickAdd?.();
              }}
              aria-label="Quick add task"
              className={cn(
                "w-full p-2 rounded-xl flex items-center justify-center",
                "bg-amber-500/15 hover:bg-amber-500/20",
                "text-amber-300 hover:text-amber-200",
                "border border-amber-500/30 hover:border-amber-400/40",
                "transition-all duration-200",
              )}
            >
              <Plus size={14} className="mx-auto" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="p-4 pb-3 pr-10 border-b border-zinc-800/60">
            <div className="flex min-w-0 items-center gap-2 text-zinc-400">
              <Inbox size={15} />
              <span className="min-w-0 text-sm font-medium truncate">Inbox</span>
              {tasks.length > 0 && (
                <span className="shrink-0 text-[11px] text-amber-400/80 font-semibold tabular-nums bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                  {tasks.length}
                </span>
              )}
            </div>
          </div>

          {/* Task list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <AnimatePresence mode="popLayout">
              {tasks.map((task) => (
                <InboxTask
                  key={task._id}
                  task={task}
                  onClick={() => onTaskClick(task)}
                />
              ))}
            </AnimatePresence>

            {tasks.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center py-12"
              >
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-zinc-800/50 flex items-center justify-center">
                  <Inbox size={20} className="text-zinc-600" />
                </div>
                <p className="text-sm text-zinc-500 font-medium">No tasks in inbox</p>
                <p className="text-xs text-zinc-600 mt-1">
                  Add tasks here to sort them later
                </p>
              </motion.div>
            )}
          </div>

          <div className="p-3 pt-2 border-t border-zinc-800/60">
            <button
              onClick={onOpenQuickAdd}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm",
                "bg-amber-500/15 hover:bg-amber-500/20",
                "text-amber-300 hover:text-amber-200",
                "border border-amber-500/30 hover:border-amber-400/40",
                "transition-all duration-200",
              )}
            >
              <Plus size={15} />
              Quick Add
            </button>
          </div>
        </>
      )}
    </motion.aside>
  );
}

export const InboxSidebar = memo(InboxSidebarComponent);
InboxSidebar.displayName = "InboxSidebar";
