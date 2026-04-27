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
import { InboxSidebar } from "./components/InboxSidebar";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { GoogleCallback } from "./components/GoogleCallback";
import { LongTermGoalsPage } from "./components/LongTermGoalsPage";
import { Kairo } from "./components/Kairo";
import { useTaskBoardData } from "./hooks/useTaskBoardData";
import { useTaskDragHandlers } from "./hooks/useTaskDragHandlers";
import { useAppKeyboardShortcuts } from "./hooks/useAppKeyboardShortcuts";
import { useAppOverlays } from "./hooks/useAppOverlays";
import type { AppPage } from "./components/TopNavbar";
import { AuthScreen } from "./components/AuthScreen";
import { useBootstrapUser } from "./hooks/useBootstrapUser";
import { useToast } from "./components/useToast";
import { TopNavbar } from "./components/TopNavbar";

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
  const [kairoActive, setKairoActive] = useState(false);
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
  const { showError } = useToast();

  const tasks = useQuery(api.tasks.listTasks, {});
  const moveTask = useMutation(api.tasks.moveTask);
  const unscheduleTask = useMutation(api.tasks.unscheduleTask);
  const reorderTasks = useMutation(api.tasks.reorderTasks);
  const reorderInboxTasks = useMutation(api.tasks.reorderInboxTasks);

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
    inboxTasks,
    moveTask,
    reorderTasks,
    reorderInboxTasks,
    unscheduleTask,
    setDraggedTask,
    onInvalidReorder: showError,
  });

  useEffect(() => {
    window.sessionStorage.setItem("pravah_active_page", activePage);
  }, [activePage]);

  if (!bootstrapReady || tasks === undefined) {
    return <LoadingSkeleton />;
  }

  const fade = kairoActive
    ? { filter: "blur(6px) saturate(.8)", opacity: 0.35, pointerEvents: "none" as const }
    : {};

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <GoogleCallback />
      <div style={{ transition: "filter .4s ease, opacity .4s ease", ...fade }}>
        <TopNavbar
          activePage={activePage}
          onNavigate={setActivePage}
          onOpenSettings={openSettings}
        />
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className="flex flex-1 overflow-hidden"
          style={{ transition: "filter .4s ease, opacity .4s ease", ...fade }}
        >
          <main className="flex-1 overflow-hidden">
            {activePage === "timeline" ? (
              <Timeline
                tasksByDate={tasksByDate}
                onTaskClick={openTaskPopup}
                onOpenQuickAdd={openQuickAdd}
              />
            ) : (
              <LongTermGoalsPage />
            )}
          </main>
          <InboxSidebar
            tasks={inboxTasks}
            onTaskClick={openTaskPopup}
            onOpenQuickAdd={openQuickAdd}
          />
        </div>

        <DragOverlay
          dropAnimation={{ duration: 180, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }}
        >
          {draggedTask && (
            <div
              style={{
                padding: "5px 8px",
                background: "rgba(255,255,255,.08)",
                border: "1px solid rgba(255,255,255,.2)",
                borderLeft: "2px solid oklch(0.78 0.14 260)",
                borderRadius: 4,
                fontSize: 11,
                color: "#ededef",
                rotate: "2deg",
                scale: "1.05",
                boxShadow: "0 20px 40px rgba(0,0,0,.4)",
                fontFamily: "var(--font-sans)",
              }}
            >
              {draggedTask.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Kairo — positioned relative to the full app */}
      <Kairo
        onActiveChange={setKairoActive}
        tasks={tasks ?? []}
        inboxTasks={inboxTasks}
        onOpenSettings={openSettings}
      />

      <Suspense fallback={null}>
        {selectedTask && <TaskPopup task={selectedTask} onClose={closeTaskPopup} />}
        {showQuickAdd && <QuickAdd onClose={closeQuickAdd} />}
        {showSettings && <Settings onClose={closeSettings} />}
      </Suspense>
    </div>
  );
}
