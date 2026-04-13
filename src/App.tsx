import { lazy, Suspense, useEffect, useState } from "react";
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
import {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "../convex/_generated/api";
import type { Task } from "./types";
import { Timeline } from "./components/Timeline";
import { TaskCard } from "./components/TaskCard";
import { InboxSidebar } from "./components/InboxSidebar";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { GoogleCallback } from "./components/GoogleCallback";
import { LongTermGoalsPage } from "./components/LongTermGoalsPage";
import { useTaskBoardData } from "./hooks/useTaskBoardData";
import { useTaskDragHandlers } from "./hooks/useTaskDragHandlers";
import { useAppKeyboardShortcuts } from "./hooks/useAppKeyboardShortcuts";
import { useAppOverlays } from "./hooks/useAppOverlays";
import type { AppPage } from "./components/TopNavbar";
import { AuthScreen } from "./components/AuthScreen";
import { useBootstrapUser } from "./hooks/useBootstrapUser";

const TaskPopup = lazy(() =>
  import("./components/TaskPopup").then((module) => ({ default: module.TaskPopup }))
);
const QuickAdd = lazy(() =>
  import("./components/QuickAdd").then((module) => ({ default: module.QuickAdd }))
);
const Settings = lazy(() =>
  import("./components/Settings").then((module) => ({ default: module.Settings }))
);

export function App() {
  return (
    <>
      <AuthLoading>
        <LoadingSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <AuthScreen />
      </Unauthenticated>
      <Authenticated>
        <AuthenticatedApp />
      </Authenticated>
    </>
  );
}

function AuthenticatedApp() {
  const [activePage, setActivePage] = useState<AppPage>(() => {
    const saved = window.sessionStorage.getItem("pravah_active_page");
    return saved === "goals" ? "goals" : "timeline";
  });
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
  const { isAuthenticated } = useConvexAuth();
  const bootstrapReady = useBootstrapUser(isAuthenticated);

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

  useEffect(() => {
    window.sessionStorage.setItem("pravah_active_page", activePage);
  }, [activePage]);

  if (!bootstrapReady || tasks === undefined) {
    return <LoadingSkeleton />;
  }

  return (
    <>
      <GoogleCallback />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="radial-dots-surface flex h-screen">
          <main className="flex-1 overflow-hidden radial-bloom-surface">
            {activePage === "timeline" ? (
              <Timeline
                tasksByDate={tasksByDate}
                onTaskClick={openTaskPopup}
                onOpenQuickAdd={openQuickAdd}
                activePage={activePage}
                onNavigate={setActivePage}
              />
            ) : (
              <LongTermGoalsPage activePage={activePage} onNavigate={setActivePage} />
            )}
          </main>
          <div className="radial-bloom-surface h-full">
            <InboxSidebar
              tasks={inboxTasks}
              onTaskClick={openTaskPopup}
              onOpenQuickAdd={openQuickAdd}
              onOpenSettings={openSettings}
            />
          </div>
        </div>

        <DragOverlay dropAnimation={null}>
          {activePage === "timeline" && draggedTask && <TaskCard task={draggedTask} isDragOverlay />}
        </DragOverlay>
      </DndContext>

      <Suspense fallback={null}>
        {selectedTask && <TaskPopup task={selectedTask} onClose={closeTaskPopup} />}
        {showQuickAdd && <QuickAdd onClose={closeQuickAdd} />}
        {showSettings && <Settings onClose={closeSettings} />}
      </Suspense>
    </>
  );
}
