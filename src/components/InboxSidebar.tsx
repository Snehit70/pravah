import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Task } from "../types";
import { cn } from "../lib/utils";
import { Button } from "./Button";

interface InboxSidebarProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

function InboxTask({ task, onClick }: { task: Task; onClick: () => void }) {
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

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: isDragging ? 0.4 : 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      className={cn(
        "px-3 py-2.5 rounded-xl cursor-grab active:cursor-grabbing",
        "bg-zinc-800/50 hover:bg-zinc-700/50",
        "border border-zinc-700/30 hover:border-zinc-600/40",
        "transition-colors duration-150",
      )}
    >
      <p className="text-[13px] text-zinc-300 truncate">{task.title}</p>
      {task.type === "deadline" && (
        <p className="text-[11px] text-zinc-600 mt-0.5">Deadline task</p>
      )}
    </motion.div>
  );
}

export function InboxSidebar({ tasks, onTaskClick }: InboxSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"open" | "deadline">("open");

  const addTask = useMutation(api.tasks.addTask);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    await addTask({ title: newTitle.trim(), type: newType });
    setNewTitle("");
    setIsAdding(false);
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 48 : 260 }}
      transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative bg-zinc-900/40 border-r border-zinc-800/60 flex flex-col overflow-hidden flex-shrink-0"
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? "Expand inbox" : "Collapse inbox"}
        className={cn(
          "absolute top-3 right-2 z-10 p-1 rounded-md",
          "text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/60",
          "transition-colors duration-150",
          collapsed && "right-1.5",
        )}
      >
        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {collapsed ? (
        /* Collapsed state */
        <div className="flex flex-col items-center pt-4 gap-2">
          <div className="p-1.5 text-zinc-500">
            <Inbox size={16} />
          </div>
          {tasks.length > 0 && (
            <span className="text-[10px] font-medium text-zinc-500 bg-zinc-800 rounded-full w-5 h-5 flex items-center justify-center">
              {tasks.length}
            </span>
          )}
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="p-4 pb-3 border-b border-zinc-800/40">
            <div className="flex items-center gap-2 text-zinc-400 mb-3">
              <Inbox size={15} />
              <span className="text-sm font-medium">Inbox</span>
              {tasks.length > 0 && (
                <span className="text-[11px] text-zinc-600 tabular-nums">
                  {tasks.length}
                </span>
              )}
            </div>

            <button
              onClick={() => setIsAdding(true)}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm",
                "bg-zinc-800/60 hover:bg-zinc-700/60",
                "text-zinc-400 hover:text-zinc-300",
                "border border-zinc-700/30 hover:border-zinc-600/40",
                "transition-all duration-150",
              )}
            >
              <Plus size={15} />
              Add Task
            </button>

            {/* Inline add form */}
            <AnimatePresence>
              {isAdding && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 space-y-2">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Task title..."
                      className={cn(
                        "w-full bg-zinc-800/80 border border-zinc-700/50 rounded-lg p-2.5 text-sm text-white",
                        "placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none",
                        "transition-colors duration-150",
                      )}
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleAdd();
                        if (e.key === "Escape") setIsAdding(false);
                      }}
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setNewType("open")}
                        className={cn(
                          "flex-1 py-1.5 text-xs rounded-md transition-colors",
                          newType === "open"
                            ? "bg-zinc-700 text-white"
                            : "text-zinc-500 hover:text-zinc-400",
                        )}
                      >
                        Open
                      </button>
                      <button
                        onClick={() => setNewType("deadline")}
                        className={cn(
                          "flex-1 py-1.5 text-xs rounded-md transition-colors",
                          newType === "deadline"
                            ? "bg-zinc-700 text-white"
                            : "text-zinc-500 hover:text-zinc-400",
                        )}
                      >
                        Deadline
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => setIsAdding(false)}
                        variant="ghost"
                        size="sm"
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAdd}
                        disabled={!newTitle.trim()}
                        variant="primary"
                        size="sm"
                        className="flex-1"
                      >
                        Add
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Task list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
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
              <div className="text-center py-12">
                <Inbox size={24} className="mx-auto text-zinc-700 mb-2" />
                <p className="text-sm text-zinc-600">No tasks in inbox</p>
                <p className="text-xs text-zinc-700 mt-1">
                  Add tasks here to sort them later
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </motion.aside>
  );
}
