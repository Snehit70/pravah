import { useState } from "react";
import { Plus, Inbox } from "lucide-react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Task } from "../types";

interface InboxSidebarProps {
  tasks: Task[];
}

function InboxTask({ task, onClick }: { task: Task; onClick: () => void }) {
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
      className="p-3 rounded-xl bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700/50 cursor-grab active:cursor-grabbing"
    >
      <div className="text-sm text-zinc-300 truncate">{task.title}</div>
    </div>
  );
}

export function InboxSidebar({ tasks }: InboxSidebarProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newType, setNewType] = useState<"open" | "deadline">("open");
  
  const addTask = useMutation(api.tasks.addTask);

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    
    await addTask({
      title: newTitle,
      type: newType,
    });
    
    setNewTitle("");
    setIsAdding(false);
  };

  return (
    <div className="w-64 bg-zinc-900/50 border-r border-zinc-800 flex flex-col">
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2 text-zinc-400 mb-3">
          <Inbox size={16} />
          <span className="text-sm font-medium">Inbox</span>
          <span className="text-xs text-zinc-600">({tasks.length})</span>
        </div>
        
        <button
          onClick={() => setIsAdding(true)}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-zinc-800 hover:bg-zinc-750 rounded-lg text-zinc-400 text-sm transition-colors"
        >
          <Plus size={16} />
          Add Task
        </button>
        
        {isAdding && (
          <div className="mt-3 space-y-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Task title..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-sm text-white"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setNewType("open")}
                className={`flex-1 py-1 text-xs rounded ${
                  newType === "open" ? "bg-zinc-700 text-white" : "text-zinc-500"
                }`}
              >
                Open
              </button>
              <button
                onClick={() => setNewType("deadline")}
                className={`flex-1 py-1 text-xs rounded ${
                  newType === "deadline" ? "bg-zinc-700 text-white" : "text-zinc-500"
                }`}
              >
                Deadline
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setIsAdding(false)}
                className="flex-1 py-1 text-xs text-zinc-500"
              >
                Cancel
              </button>
              <button
                onClick={handleAdd}
                className="flex-1 py-1 text-xs bg-white text-black rounded"
              >
                Add
              </button>
            </div>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {tasks.map((task) => (
          <InboxTask
            key={task._id}
            task={task}
            onClick={() => {}}
          />
        ))}
        {tasks.length === 0 && (
          <div className="text-center text-zinc-600 text-sm py-8">
            No tasks in inbox
          </div>
        )}
      </div>
    </div>
  );
}