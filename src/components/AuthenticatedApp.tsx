import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { useConvexAuth, useMutation, useQuery } from "../lib/data";
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
import { useWebReminders } from "../hooks/useWebReminders";
import type { AppPage } from "./TopNavbar";
import type { SettingsCategory } from "./settings/SettingsPage";
import { useBootstrapUser } from "../hooks/useBootstrapUser";
import { useToast } from "./useToast";
import { TopNavbar } from "./TopNavbar";
import { isWebGoalsLinkingEnabled } from "../lib/featureFlags";
import { isTaskCompleted } from "../lib/taskState";
import { getLocalDateString } from "../lib/utils";

const TaskPopup = lazy(() =>
  import("./TaskPopup").then((module) => ({ default: module.TaskPopup }))
);
const QuickAdd = lazy(() =>
  import("./QuickAdd").then((module) => ({ default: module.QuickAdd }))
);
const SettingsPage = lazy(() =>
  import("./settings/SettingsPage").then((module) => ({ default: module.SettingsPage }))
);

export function AuthenticatedApp() {
  const webGoalsLinkingEnabled = isWebGoalsLinkingEnabled();
  const [activePage, setActivePage] = useState<AppPage>(() => {
    const saved = window.sessionStorage.getItem("pravah_active_page");
    if (saved === "goals" || saved === "insights" || saved === "settings") return saved;
    return "timeline";
  });
  const [draggedTask, setDraggedTask] = useState<Task | null>(null);
  const [kairoActive, setKairoActive] = useState(false);
  // Which settings category a deep link (e.g. Kairo's "finish setup" banner)
  // should land on. Plain header navigation keeps the last seed.
  const [settingsSeed, setSettingsSeed] = useState<{ category: SettingsCategory; nonce: number }>({
    category: "kairo",
    nonce: 0,
  });
  const lastWorkspacePageRef = useRef<AppPage>("timeline");
  const { selectedTask, showQuickAdd, openTaskPopup, closeTaskPopup, openQuickAdd, closeQuickAdd } =
    useAppOverlays();
  const { isAuthenticated } = useConvexAuth();
  const bootstrapReady = useBootstrapUser(isAuthenticated);
  const { showToast, showError, showSuccess } = useToast();

  const boardTasks = useQuery(api.tasks.listBoardTasks, {});
  const today = getLocalDateString();
  const wantsCompletedHistory = activePage === "insights" || activePage === "goals";
  const completedTasks = useQuery(
    api.tasks.listTasks,
    wantsCompletedHistory ? { status: "completed" } : "skip"
  );
  const completedToday = useQuery(
    api.tasks.listTasks,
    activePage === "timeline" ? { status: "completed", date: today } : "skip"
  );
  const kairoTasks = useQuery(api.tasks.listTasks, kairoActive ? {} : "skip");
  const goals = useQuery(api.goals.list, webGoalsLinkingEnabled ? {} : "skip");
  const boardLinkIds = [...new Set([...(boardTasks ?? []), ...(completedToday ?? [])].map((task) => task._id))].sort();
  const goalLinks = useQuery(api.goals.listLinks, !webGoalsLinkingEnabled ? "skip"
    : wantsCompletedHistory || boardLinkIds.length > 500 ? {}
    : boardTasks === undefined ? "skip" : { taskIds: boardLinkIds });
  const upsertGoal = useMutation(api.goals.upsert);
  const removeGoal = useMutation(api.goals.remove);
  const moveTask = useMutation(api.tasks.moveTask);
  const completeTask = useMutation(api.tasks.completeTask);
  const bulkSoftDeleteInboxTasks = useMutation(api.tasks.bulkSoftDeleteInboxTasks);
  const restoreInboxTasks = useMutation(api.tasks.restoreInboxTasks);
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
      if (next !== "settings" && activePage !== "settings") {
        lastWorkspacePageRef.current = next;
      }
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

  const allTasksForStats = useMemo(() => {
    const extra = wantsCompletedHistory ? (completedTasks ?? []) : (completedToday ?? []);
    return [...(boardTasks ?? []), ...extra];
  }, [boardTasks, completedTasks, completedToday, wantsCompletedHistory]);
  useWebReminders(boardTasks ?? []);

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
      if (isTaskCompleted(task)) {
        initial[goalId].done += 1;
      }
    }
    return initial;
  }, [boardTasks, goalLinks, goals, webGoalsLinkingEnabled]);

  const linkedTasksByGoalId = useMemo(() => {
    if (!webGoalsLinkingEnabled || !goalLinks) return {};
    const taskById = new Map(allTasksForStats.map((task) => [String(task._id), task]));
    const mapped: Record<string, Task[]> = {};
    for (const [taskId, goalId] of Object.entries(goalLinks)) {
      const task = taskById.get(taskId);
      if (!task) continue;
      (mapped[goalId] ??= []).push(task);
    }
    return mapped;
  }, [allTasksForStats, goalLinks, webGoalsLinkingEnabled]);

  const handleCreateGoal = useCallback(
    async (
      text: string,
      fields?: { description?: string; deadline?: string; priority?: "p1" | "p2" | "p3" }
    ) => {
      const goalId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await upsertGoal({
        clientId: goalId,
        text,
        description: fields?.description,
        deadline: fields?.deadline,
        priority: fields?.priority,
        createdAt: Date.now(),
      });
    },
    [upsertGoal]
  );

  const handleUpdateGoal = useCallback(
    async (
      goalId: string,
      patch: { description?: string; deadline?: string; priority?: "p1" | "p2" | "p3" }
    ) => {
      const goal = goals?.find((candidate) => candidate.id === goalId);
      if (!goal) throw new Error("Goal not found");
      await upsertGoal({
        clientId: goalId,
        text: goal.text,
        description: patch.description,
        deadline: patch.deadline,
        priority: patch.priority,
        createdAt: goal.createdAt ?? Date.now(),
      });
    },
    [goals, upsertGoal]
  );

  const handleDeleteGoal = useCallback(
    async (goalId: string) => {
      await removeGoal({ clientId: goalId });
    },
    [removeGoal]
  );

  const handleInboxSchedule = useCallback(
    async (taskId: Task["_id"], targetDate: string) => {
      try {
        await moveTask({ taskId, targetDate });
        showSuccess(`Scheduled for ${targetDate}`);
      } catch {
        showError("Could not schedule task");
      }
    },
    [moveTask, showError, showSuccess]
  );

  const handleToggleComplete = useCallback(
    async (task: Task) => {
      try {
        await completeTask({ taskId: task._id });
      } catch {
        showError("Could not complete the task");
      }
    },
    [completeTask, showError]
  );

  const handleCompleteManyInboxTasks = useCallback(
    async (taskIds: Task["_id"][]) => {
      try {
        await Promise.all(taskIds.map((taskId) => completeTask({ taskId })));
        showSuccess(`${taskIds.length} task${taskIds.length === 1 ? "" : "s"} completed`);
        return true;
      } catch {
        showError("Could not complete the selected tasks");
        return false;
      }
    },
    [completeTask, showError, showSuccess]
  );

  const handleDeleteManyInboxTasks = useCallback(
    async (taskIds: Task["_id"][]) => {
      try {
        await bulkSoftDeleteInboxTasks({ taskIds });
        showToast(`Moved ${taskIds.length} task${taskIds.length === 1 ? "" : "s"} to trash`, "info", {
          label: "Undo",
          run: async () => {
            try {
              await restoreInboxTasks({ taskIds });
              showSuccess("Inbox tasks restored");
            } catch {
              showError("Could not restore inbox tasks");
            }
          },
        });
        return true;
      } catch {
        showError("Could not delete the selected tasks");
        return false;
      }
    },
    [bulkSoftDeleteInboxTasks, restoreInboxTasks, showError, showSuccess, showToast]
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
        <TopNavbar activePage={activePage} onNavigate={navigate} />
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
            {activePage === "settings" ? (
              <SettingsPage
                initialCategory={settingsSeed.category}
                seedNonce={settingsSeed.nonce}
                tasks={allTasksForStats}
                onBack={() => navigate(lastWorkspacePageRef.current)}
              />
            ) : activePage === "timeline" ? (
              <Timeline
                tasksByDate={tasksByDate}
                allTasks={allTasksForStats}
                goalNameByTaskId={goalNameByTaskId}
                onTaskClick={openTaskPopup}
                onOpenQuickAdd={openQuickAdd}
                onRescheduleTask={(taskId, targetDate) => void handleInboxSchedule(taskId, targetDate)}
                onToggleComplete={(task) => void handleToggleComplete(task)}
              />
            ) : activePage === "goals" ? (
              <LongTermGoalsPage
                readOnly={false}
                serverBacked={webGoalsLinkingEnabled}
                serverGoals={goals ?? undefined}
                progressByGoalId={progressByGoalId}
                onCreateServerGoal={handleCreateGoal}
                onUpdateServerGoal={handleUpdateGoal}
                onDeleteServerGoal={handleDeleteGoal}
                linkedTasksByGoalId={linkedTasksByGoalId}
                onOpenTask={openTaskPopup}
              />
            ) : (
              <InsightsPage
                tasks={allTasksForStats}
                completedTasks={completedTasks ?? undefined}
                goals={goals ?? undefined}
                progressByGoalId={progressByGoalId}
              />
            )}
          </main>
          {activePage !== "settings" && (
            <InboxSidebar
              tasks={inboxTasks}
              goalNameByTaskId={goalNameByTaskId}
              onTaskClick={openTaskPopup}
              onOpenQuickAdd={openQuickAdd}
              onScheduleTask={(taskId, targetDate) => void handleInboxSchedule(taskId, targetDate)}
              onCompleteMany={handleCompleteManyInboxTasks}
              onDeleteMany={handleDeleteManyInboxTasks}
            />
          )}
        </div>

        <DragOverlay
          dropAnimation={{ duration: 240, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
        >
          {draggedTask && (
            <div
              style={{
                padding: "8px 12px",
                background: "var(--color-bg-floating)",
                border: "1px solid var(--color-border-focus)",
                borderRadius: 5,
                fontSize: 12,
                color: "var(--color-text-primary)",
                transform: "rotate(0.6deg) scale(1.03)",
                boxShadow:
                  "0 24px 60px rgba(39, 30, 22, 0.22), 0 0 0 1px var(--color-border-subtle)",
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
        onOpenSettings={(category) => {
          setSettingsSeed((seed) => ({ category: category ?? "kairo", nonce: seed.nonce + 1 }));
          navigate("settings");
        }}
      />

      <Suspense fallback={null}>
        {selectedTask && <TaskPopup task={selectedTask} onClose={closeTaskPopup} />}
        {showQuickAdd && <QuickAdd onClose={closeQuickAdd} />}
      </Suspense>
    </div>
  );
}
