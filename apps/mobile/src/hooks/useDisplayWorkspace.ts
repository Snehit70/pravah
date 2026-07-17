import type { TabKey } from "../components/BottomTabBar";
import type { MobileTask } from "../components/TaskCard";
import { isTaskCompleted, isTaskInInbox, isTaskOnTimeline } from "../lib/taskState";
import type { WorkspaceSnapshot } from "../lib/workspace-snapshot";

export type WorkspaceLoadingState = {
  inbox: boolean;
  timeline: boolean;
  completed: boolean;
  allTasksReady: boolean;
};

export type DisplayWorkspaceInput = {
  activeTab: TabKey;
  sessionReady: boolean;
  sessionLoading: boolean;
  hasCachedSessionHint: boolean;
  today: string;
  inboxTasks: MobileTask[];
  scheduledTasks: MobileTask[];
  completedTasks: MobileTask[];
  allWorkspaceTasks: MobileTask[];
  loading: WorkspaceLoadingState;
  snapshot: WorkspaceSnapshot | null;
  isSnapshotHydrated: boolean;
  optimisticTasks: MobileTask[] | null;
};

export type DisplayWorkspace = {
  hasLiveWorkspaceData: boolean;
  shouldRenderOptimisticShell: boolean;
  shouldUseWorkspaceSnapshot: boolean;
  displayInboxTasks: MobileTask[];
  displayScheduledTasks: MobileTask[];
  displayCompletedTasks: MobileTask[];
  workspaceTaskCorpus: MobileTask[];
  displayTimelineSections: [string, MobileTask[]][];
  displayInboxCount: number;
  displayOverdueCount: number;
  displayUpcomingCount: number;
  displayCompletedCount: number;
  activeServerTasks: MobileTask[];
  tasks: MobileTask[];
  visibleTasks: MobileTask[];
  isActiveListLoading: boolean;
  isGoalsTaskDataLoading: boolean;
  isTimelineTriageReady: boolean;
  isBootShellLoading: boolean;
  kairoTasks: MobileTask[];
};

function groupTimelineSections(tasks: MobileTask[], today: string): [string, MobileTask[]][] {
  const grouped = new Map<string, MobileTask[]>();
  for (const task of tasks) {
    const deadline = task.deadline ?? "unscheduled";
    const key = deadline < today ? "overdue" : deadline;
    const existing = grouped.get(key) ?? [];
    existing.push(task);
    grouped.set(key, existing);
  }
  return [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function computeIsActiveListLoading(
  activeTab: TabKey,
  shouldUseWorkspaceSnapshot: boolean,
  loading: WorkspaceLoadingState,
): boolean {
  if (shouldUseWorkspaceSnapshot) return false;

  switch (activeTab) {
    case "timeline":
      return loading.timeline;
    case "inbox":
      return loading.inbox;
    case "insights":
      return loading.completed || !loading.allTasksReady;
    case "goals":
      return !loading.allTasksReady;
    default:
      return false;
  }
}

export function deriveDisplayWorkspace(input: DisplayWorkspaceInput): DisplayWorkspace {
  const hasLiveWorkspaceData =
    !input.loading.inbox && !input.loading.timeline && !input.loading.completed;
  const shouldRenderOptimisticShell = input.sessionLoading && input.hasCachedSessionHint;
  const shouldUseWorkspaceSnapshot =
    input.sessionReady &&
    input.snapshot !== null &&
    input.isSnapshotHydrated &&
    !hasLiveWorkspaceData;

  const displayInboxTasks = shouldUseWorkspaceSnapshot
    ? input.snapshot!.inboxTasks
    : input.inboxTasks;
  const displayScheduledTasks = shouldUseWorkspaceSnapshot
    ? input.snapshot!.scheduledTasks
    : input.scheduledTasks;
  const displayCompletedTasks = shouldUseWorkspaceSnapshot
    ? input.snapshot!.completedTasks
    : input.completedTasks;

  const workspaceTaskCorpus = shouldUseWorkspaceSnapshot
    ? [...displayInboxTasks, ...displayScheduledTasks, ...displayCompletedTasks]
    : input.allWorkspaceTasks;
  const displayTimelineSections = groupTimelineSections(displayScheduledTasks, input.today);

  let displayOverdueCount = 0;
  let displayUpcomingCount = 0;
  for (const task of displayScheduledTasks) {
    const date = task.deadline;
    if (!date) continue;
    if (date < input.today) displayOverdueCount += 1;
    else displayUpcomingCount += 1;
  }

  const activeServerTasks =
    input.activeTab === "timeline"
      ? input.scheduledTasks
      : input.activeTab === "inbox"
        ? input.inboxTasks
        : input.activeTab === "goals"
          ? workspaceTaskCorpus
          : input.completedTasks;

  const tabTasks =
    input.activeTab === "timeline"
      ? displayScheduledTasks
      : input.activeTab === "inbox"
        ? displayInboxTasks
        : displayCompletedTasks;
  const optimisticTabTasks = input.optimisticTasks?.filter((task) =>
    input.activeTab === "timeline"
      ? isTaskOnTimeline(task)
      : input.activeTab === "inbox"
        ? isTaskInInbox(task)
        : isTaskCompleted(task),
  );
  const tasks = optimisticTabTasks ?? tabTasks;

  const isActiveListLoading = computeIsActiveListLoading(
    input.activeTab,
    shouldUseWorkspaceSnapshot,
    input.loading,
  );

  return {
    hasLiveWorkspaceData,
    shouldRenderOptimisticShell,
    shouldUseWorkspaceSnapshot,
    displayInboxTasks,
    displayScheduledTasks,
    displayCompletedTasks,
    workspaceTaskCorpus,
    displayTimelineSections,
    displayInboxCount: displayInboxTasks.length,
    displayOverdueCount,
    displayUpcomingCount,
    displayCompletedCount: displayCompletedTasks.length,
    activeServerTasks,
    tasks,
    visibleTasks: tasks,
    isActiveListLoading,
    isGoalsTaskDataLoading:
      input.activeTab === "goals" && !shouldUseWorkspaceSnapshot && !input.loading.allTasksReady,
    isTimelineTriageReady: shouldUseWorkspaceSnapshot || input.loading.allTasksReady,
    isBootShellLoading:
      shouldRenderOptimisticShell && !shouldUseWorkspaceSnapshot && !input.sessionReady,
    kairoTasks: input.allWorkspaceTasks,
  };
}

export function useDisplayWorkspace(input: DisplayWorkspaceInput): DisplayWorkspace {
  return deriveDisplayWorkspace(input);
}
