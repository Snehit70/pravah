import { useRef, useEffect, useState } from "react";
import { DayColumn } from "./DayColumn";
import type { Task } from "../types";
import { Settings as SettingsIcon } from "lucide-react";

interface TimelineProps {
  tasksByDate: Record<string, Task[]>;
  onTaskClick: (task: Task) => void;
  onOpenSettings?: () => void;
}

export function Timeline({ tasksByDate, onTaskClick, onOpenSettings }: TimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    const today = new Date();
    const generatedDates: string[] = [];
    
    for (let i = -7; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      generatedDates.push(d.toISOString().split("T")[0]);
    }
    
    setDates(generatedDates);
  }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-white">Pravah</span>
          <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">β</span>
        </div>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <SettingsIcon size={18} />
          </button>
        )}
      </div>
      
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex px-4 py-6 min-w-max" ref={containerRef}>
          {dates.map((date) => (
            <DayColumn
              key={date}
              date={date}
              tasks={tasksByDate[date] || []}
              onTaskClick={onTaskClick}
            />
          ))}
        </div>
      </div>
      
      <div className="h-px bg-zinc-800 mx-4" />
      
      <div className="px-4 py-2 text-center text-xs text-zinc-600">
        Drag tasks to reorder or move between days
      </div>
    </div>
  );
}