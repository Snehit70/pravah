import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { useQuery, useMutation } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Task } from "./types";
import { Timeline } from "./components/Timeline";
import { TaskCard } from "./components/TaskCard";
import { TaskPopup } from "./components/TaskPopup";
import { InboxSidebar } from "./components/InboxSidebar";
import { QuickAdd } from "./components/QuickAdd";
import { Settings } from "./components/Settings";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { GoogleCallback } from "./components/GoogleCallback";
import { useTaskBoardData } from "./hooks/useTaskBoardData";
import { useTaskDragHandlers } from "./hooks/useTaskDragHandlers";
import { useAppKeyboardShortcuts } from "./hooks/useAppKeyboardShortcuts";

export function App() {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const tasks = useQuery(api.tasks.listTasks, {});
  const moveTask = useMutation(api.tasks.moveTask);
  const reorderTasks = useMutation(api.tasks.reorderTasks);

  useAppKeyboardShortcuts({
    openQuickAdd: () => setShowQuickAdd(true),
    closeQuickAdd: () => setShowQuickAdd(false),
    closeTaskPopup: () => setSelectedTask(null),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const { inboxTasks, tasksByDate } = useTaskBoardData(tasks);

  const { handleDragStart, handleDragEnd } = useTaskDragHandlers({
    tasks,
    tasksByDate,
    moveTask,
    reorderTasks,
    setDraggedTask,
  });

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
      <GoogleCallback />
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
