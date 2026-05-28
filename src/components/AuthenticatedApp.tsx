import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
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
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Task } from "../types";
import { Timeline } from "./Timeline";
import { InboxSidebar } from "./InboxSidebar";
import { LoadingSkeleton } from "./LoadingSkeleton";
import { GoogleCallback } from "./GoogleCallback";
import { LongTermGoalsPage } from "./LongTermGoalsPage";
import { InsightsPage } from "./InsightsPage";
import { Kairo } from "./Kairo";
import { useTaskBoardData } from "../hooks/useTaskBoardData";
import { useTaskDragHandlers } from "../hooks/useTaskDragHandlers";
import { useAppKeyboardShortcuts } from "../hooks/useAppKeyboardShortcuts";
import { useAppOverlays } from "../hooks/useAppOverlays";
import type { AppPage } from "./TopNavbar";
import { useBootstrapUser } from "../hooks/useBootstrapUser";
import { useToast } from "./useToast";
import { TopNavbar } from "./TopNavbar";
import { getLocalDateString } from "../lib/utils";
import { isWebGoalsLinkingEnabled } from "../lib/featureFlags";

const TaskPopup = lazy(() =>
  import("./TaskPopup").then((module) => ({ default: module.TaskPopup }))
);
const QuickAdd = lazy(() =>
  import("./QuickAdd").then((module) => ({ default: module.QuickAdd }))
);
const Settings = lazy(() =>
  import("./Settings").then((module) => ({ default: module.Settings }))
);

export function AuthenticatedApp() {
  const webGoalsLinkingEnabled = isWebGoalsLinkingEnabled();
  const [activePage, setActivePage] = useState<AppPage>(() => {
    const saved = window.sessionStorage.getItem("pravah_active_page");
    if (saved === "goals" || saved === "insights") return saved;
    return "timeline";
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

  const boardTasks = useQuery(api.tasks.listBoardTasks, {});
  const todayCompletedTasks = useQuery(api.tasks.listTodayCompletedTasks, {
    clientDate: getLocalDateString(),
  });
  const kairoTasks = useQuery(api.tasks.listTasks, kairoActive ? {} : "skip");
  const goals = useQuery(api.goals.list, webGoalsLinkingEnabled ? {} : "skip");
  const goalLinks = useQuery(api.goals.listLinks, webGoalsLinkingEnabled ? {} : "skip");
  const upsertGoal = useMutation(api.goals.upsert);
  const removeGoal = useMutation(api.goals.remove);
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

  const { inboxTasks, tasksByDate } = useTaskBoardData(boardTasks);

  const { handleDragStart, handleDragEnd } = useTaskDragHandlers({
    tasks: boardTasks,
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

  const navigate = useCallback(
    (next: AppPage) => {
      if (next === activePage) return;
      type DocVT = Document & {
        startViewTransition?: (cb: () => void) => unknown;
      };
      const doc = document as DocVT;
      if (typeof doc.startViewTransition === "function") {
        doc.startViewTransition(() => {
          flushSync(() => setActivePage(next));
        });
      } else {
        setActivePage(next);
      }
    },
    [activePage]
  );

  const allTasksForStats = [
    ...(boardTasks ?? []),
    ...(todayCompletedTasks ?? []),
  ];

  const goalNameByTaskId = useMemo(() => {
    if (!webGoalsLinkingEnabled || !goals || !goalLinks) return {};
    const byId = new Map(goals.map((goal) => [goal.id, goal.text]));
    const mapped: Record<string, string> = {};
    for (const [taskId, goalId] of Object.entries(goalLinks)) {
      const goalName = byId.get(goalId);
      if (goalName) {
        mapped[taskId] = goalName;
      } else {
        console.warn("web_goals_missing_goal_for_link", { taskId, goalId });
      }
    }
    return mapped;
  }, [goalLinks, goals, webGoalsLinkingEnabled]);

  const progressByGoalId = useMemo(() => {
    if (!webGoalsLinkingEnabled || !goals || !goalLinks || !boardTasks) return {};
    const taskById = new Map(boardTasks.map((task) => [String(task._id), task]));
    const initial: Record<string, { total: number; done: number }> = {};
    for (const goal of goals) initial[goal.id] = { total: 0, done: 0 };
    for (const [taskId, goalId] of Object.entries(goalLinks)) {
      const task = taskById.get(taskId);
      if (!task || !initial[goalId]) continue;
      initial[goalId].total += 1;
      if (task.status === "completed") initial[goalId].done += 1;
    }
    return initial;
  }, [boardTasks, goalLinks, goals, webGoalsLinkingEnabled]);

  const handleCreateGoal = useCallback(
    async (text: string) => {
      const goalId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await upsertGoal({
        clientId: goalId,
        text,
        createdAt: Date.now(),
      });
    },
    [upsertGoal]
  );

  const handleDeleteGoal = useCallback(
    async (goalId: string) => {
      await removeGoal({ clientId: goalId });
    },
    [removeGoal]
  );

  if (!bootstrapReady || boardTasks === undefined) {
    return <LoadingSkeleton />;
  }

  const fade = kairoActive
    ? { opacity: 0.38, pointerEvents: "none" as const }
    : { opacity: 1 };

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>
      <GoogleCallback />
      <div style={{ transition: "opacity var(--dur-slow) var(--ease-out-expo)", ...fade }}>
        <TopNavbar
          activePage={activePage}
          onNavigate={navigate}
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
          style={{ transition: "opacity var(--dur-slow) var(--ease-out-expo)", ...fade }}
        >
          <main className="flex-1 overflow-hidden">
            {activePage === "timeline" ? (
              <Timeline
                tasksByDate={tasksByDate}
                allTasks={allTasksForStats}
                goalNameByTaskId={goalNameByTaskId}
                onTaskClick={openTaskPopup}
                onOpenQuickAdd={openQuickAdd}
              />
            ) : activePage === "goals" ? (
              <LongTermGoalsPage
                readOnly={false}
                serverBacked={webGoalsLinkingEnabled}
                serverGoals={goals ?? undefined}
                progressByGoalId={progressByGoalId}
                onCreateServerGoal={handleCreateGoal}
                onDeleteServerGoal={handleDeleteGoal}
              />
            ) : (
              <InsightsPage tasks={allTasksForStats} />
            )}
          </main>
          <InboxSidebar
            tasks={inboxTasks}
            goalNameByTaskId={goalNameByTaskId}
            onTaskClick={openTaskPopup}
            onOpenQuickAdd={openQuickAdd}
          />
        </div>

        <DragOverlay
          dropAnimation={{ duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          {draggedTask && (
            <div
              style={{
                padding: "8px 12px",
                background: "rgba(20, 20, 24, 0.92)",
                backdropFilter: "blur(6px)",
                WebkitBackdropFilter: "blur(6px)",
                border: "1px solid oklch(0.78 0.14 260 / 0.45)",
                borderLeft: "3px solid oklch(0.78 0.14 260)",
                borderRadius: 5,
                fontSize: 12,
                color: "#ededef",
                transform: "rotate(0.6deg) scale(1.03)",
                boxShadow:
                  "0 24px 60px rgba(0,0,0,0.55), 0 8px 18px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.04), 0 0 28px oklch(0.78 0.14 260 / 0.28)",
                fontFamily: "var(--font-sans)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                maxWidth: 320,
              }}
            >
              {draggedTask.title}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <Kairo
        onActiveChange={setKairoActive}
        tasks={kairoTasks ?? boardTasks}
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
