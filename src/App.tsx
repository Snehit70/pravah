import { useState } from "react";
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
import { useAppOverlays } from "./hooks/useAppOverlays";

export function App() {
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const {
    selectedTask,
    showQuickAdd,
    showSettings,
    openTaskPopup,
    closeTaskPopup,
    openQuickAdd,
    closeQuickAdd,
    openSettings,
    closeSettings,
  } = useAppOverlays();

  const tasks = useQuery(api.tasks.listTasks, {});
  const moveTask = useMutation(api.tasks.moveTask);
  const reorderTasks = useMutation(api.tasks.reorderTasks);

  useAppKeyboardShortcuts({
    openQuickAdd,
    closeQuickAdd,
    closeTaskPopup,
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
          <InboxSidebar tasks={inboxTasks} onTaskClick={openTaskPopup} />
        </div>
        <main className="flex-1 overflow-hidden radial-bloom-surface">
          <Timeline
            tasksByDate={tasksByDate}
            onTaskClick={openTaskPopup}
            onOpenSettings={openSettings}
            onOpenQuickAdd={openQuickAdd}
          />
        </main>
      </div>

      <DragOverlay dropAnimation={null}>
        {draggedTask && <TaskCard task={draggedTask} isDragOverlay />}
      </DragOverlay>

      {selectedTask && (
        <TaskPopup task={selectedTask} onClose={closeTaskPopup} />
      )}

      {showQuickAdd && <QuickAdd onClose={closeQuickAdd} />}

      {showSettings && <Settings onClose={closeSettings} />}
    </DndContext>
  );
}
