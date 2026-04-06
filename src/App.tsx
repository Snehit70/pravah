import { useCallback, useMemo } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import { Timeline } from "./components/Timeline";
import { TaskCard } from "./components/TaskCard";
import { TaskPopup } from "./components/TaskPopup";
import { InboxSidebar } from "./components/InboxSidebar";
import { useState } from "react";

interface Task {
  _id: Id<"tasks">;
  title: string;
  description?: string;
  type: "open" | "deadline";
  scheduledDate?: string;
  deadline?: string;
  position: number;
  status: "inbox" | "scheduled" | "completed" | "cancelled";
  source?: "manual" | "ai-agent" | "gmail" | "gcal";
  estimatedMinutes?: number;
  tags?: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export function App() {
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const tasks = useQuery(api.tasks.listTasks, {});
  const moveTask = useMutation(api.tasks.moveTask);
  const reorderTasks = useMutation(api.tasks.reorderTasks);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const inboxTasks = useMemo(
    () => tasks?.filter((t) => t.status === "inbox") || [],
    [tasks]
  );

  const scheduledTasks = useMemo(
    () => tasks?.filter((t) => t.status === "scheduled") || [],
    [tasks]
  );

  const tasksByDate = useMemo(() => {
    const grouped: Record<string, Task[]> = {};
    for (const task of scheduledTasks) {
      if (!task.scheduledDate) continue;
      if (!grouped[task.scheduledDate]) grouped[task.scheduledDate] = [];
      grouped[task.scheduledDate].push(task);
    }
    for (const date of Object.keys(grouped)) {
      grouped[date].sort((a, b) => a.position - b.position);
    }
    return grouped;
  }, [scheduledTasks]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const task = tasks?.find((t) => t._id === event.active.id);
      if (task) setActiveTask(task);
    },
    [tasks]
  );

  const handleDragOver = useCallback(
    (_event: DragOverEvent) => {
      // Future: handle drag over for cross-container movement
    },
    []
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveTask(null);

      if (!over) return;

      const activeId = active.id as Id<"tasks">;
      const overId = over.id as string;

      const activeTask = tasks?.find((t) => t._id === activeId);
      if (!activeTask) return;

      // Check if dropping on a date column
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(overId)) {
        // Moving to a new date
        const targetDate = overId;

        if (activeTask.type === "deadline" && activeTask.deadline) {
          if (targetDate > activeTask.deadline) {
            return; // Can't move past deadline
          }
        }

        await moveTask({
          taskId: activeId,
          targetDate,
        });
        return;
      }

      // Reordering within same day
      if (activeTask.scheduledDate) {
        const dayTasks = tasksByDate[activeTask.scheduledDate] || [];
        const oldIndex = dayTasks.findIndex((t) => t._id === activeId);
        const newIndex = dayTasks.findIndex((t) => t._id === overId);

        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(dayTasks, oldIndex, newIndex);
          await reorderTasks({
            date: activeTask.scheduledDate,
            taskIds: newOrder.map((t) => t._id),
          });
        }
      }
    },
    [tasks, tasksByDate, moveTask, reorderTasks]
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-screen bg-[#0a0a0a]">
        <InboxSidebar tasks={inboxTasks} />
        <main className="flex-1 overflow-hidden">
          <Timeline tasksByDate={tasksByDate} onTaskClick={(task) => setSelectedTask(task)} />
        </main>
      </div>

      <DragOverlay>
        {activeTask && (
          <TaskCard task={activeTask} isDragging />
        )}
      </DragOverlay>

      {selectedTask && (
        <TaskPopup
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </DndContext>
  );
}