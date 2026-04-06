import { useRef, useEffect, useState } from "react";
import { DayColumn } from "./DayColumn";
import type { Task } from "../types";

interface TimelineProps {
  tasksByDate: Record<string, Task[]>;
  onTaskClick: (task: Task) => void;
}

export function Timeline({ tasksByDate, onTaskClick }: TimelineProps) {
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