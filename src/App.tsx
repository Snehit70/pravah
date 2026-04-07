import { useCallback, useMemo, useEffect, useState } from "react";
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
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import type { Task } from "./types";
import { Timeline } from "./components/Timeline";
import { TaskCard } from "./components/TaskCard";
import { TaskPopup } from "./components/TaskPopup";
import { InboxSidebar } from "./components/InboxSidebar";
import { QuickAdd } from "./components/QuickAdd";
import { Settings } from "./components/Settings";
import { LoadingSkeleton } from "./components/LoadingSkeleton";

export function App() {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const tasks = useQuery(api.tasks.listTasks, {});
  const moveTask = useMutation(api.tasks.moveTask);
  const reorderTasks = useMutation(api.tasks.reorderTasks);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        setShowQuickAdd(true);
      }
      if (e.key === "Escape") {
        setShowQuickAdd(false);
        setSelectedTask(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const inboxTasks = useMemo(
    () => tasks?.filter((t) => t.status === "inbox") ?? [],
    [tasks]
  );

  const scheduledTasks = useMemo(
    () => tasks?.filter((t) => t.status === "scheduled") ?? [],
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
      if (task) setDraggedTask(task);
    },
    [tasks]
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      setDraggedTask(null);

      if (!over) return;

      const activeId = active.id as Id<"tasks">;
      const overId = over.id as string;
      const sourceTask = tasks?.find((t) => t._id === activeId);
      if (!sourceTask) return;

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

      // Cross-day movement: dropping on a date column
      if (dateRegex.test(overId)) {
        if (sourceTask.type === "deadline" && sourceTask.deadline && overId > sourceTask.deadline) {
          return; // Can't move past deadline
        }
        await moveTask({ taskId: activeId, targetDate: overId });
        return;
      }

      // Reordering within same day
      if (sourceTask.scheduledDate) {
        const dayTasks = tasksByDate[sourceTask.scheduledDate] ?? [];
        const oldIndex = dayTasks.findIndex((t) => t._id === activeId);
        const newIndex = dayTasks.findIndex((t) => t._id === overId);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = arrayMove(dayTasks, oldIndex, newIndex);
          await reorderTasks({
            date: sourceTask.scheduledDate,
            taskIds: newOrder.map((t) => t._id),
          });
        }
      }
    },
    [tasks, tasksByDate, moveTask, reorderTasks]
  );

  const handleTaskClick = useCallback((task: Task) => {
    setSelectedTask(task);
  }, []);

  if (tasks === undefined) {
    return <LoadingSkeleton />;
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="radial-dots-surface flex h-screen">
        <div className="radial-bloom-surface">
          <InboxSidebar tasks={inboxTasks} onTaskClick={handleTaskClick} />
        </div>
        <main className="flex-1 overflow-hidden radial-bloom-surface">
          <Timeline
            tasksByDate={tasksByDate}
            onTaskClick={handleTaskClick}
            onOpenSettings={() => setShowSettings(true)}
            onOpenQuickAdd={() => setShowQuickAdd(true)}
          />
        </main>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggedTask && <TaskCard task={draggedTask} isDragOverlay />}
      </DragOverlay>

      {selectedTask && (
        <TaskPopup task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}

      {showQuickAdd && <QuickAdd onClose={() => setShowQuickAdd(false)} />}

      {showSettings && <Settings onClose={() => setShowSettings(false)} />}
    </DndContext>
  );
}
