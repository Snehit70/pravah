/** @vitest-environment happy-dom */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import type { Task } from "../types";
import type { Id } from "../../convex/_generated/dataModel";
import { getLocalDateString } from "../lib/utils";
import { renderWithProviders } from "./renderWithProviders";

const useQueryMock = vi.fn();
const useMutationMock = vi.fn();

vi.mock("@dnd-kit/core", () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div data-testid="dnd-root">{children}</div>,
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  closestCorners: () => null,
  KeyboardSensor: class MockKeyboardSensor {},
  PointerSensor: class MockPointerSensor {},
  useDroppable: () => ({
    setNodeRef: () => undefined,
    isOver: false,
  }),
  useSensor: () => ({}),
  useSensors: (...sensors: unknown[]) => sensors,
  useDndMonitor: () => undefined,
}));

vi.mock("@dnd-kit/sortable", () => ({
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => undefined,
    transform: null,
    transition: undefined,
    isDragging: false,
  }),
  SortableContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  verticalListSortingStrategy: () => null,
  sortableKeyboardCoordinates: () => ({ x: 0, y: 0 }),
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => "",
    },
  },
}));

vi.mock("convex/react", () => ({
  AuthLoading: () => null,
  Authenticated: ({ children }: { children: ReactNode }) => <>{children}</>,
  Unauthenticated: () => null,
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useConvexConnectionState: () => ({
    isWebSocketConnected: true,
    hasInflightRequests: false,
    connectionCount: 1,
  }),
  useQuery: (ref: unknown, args: unknown) => {
    if (args === "skip") return undefined;
    if (ref === "goalProgress.list") return { ready: true, progress: {} };
    if (ref === "goals.list") return [];
    if (ref === "goals.listLinks") return {};
    return useQueryMock(ref, args);
  },
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    tasks: {
      listBoardTasks: "tasks.listBoardTasks",
      listTodayCompletedTasks: "tasks.listTodayCompletedTasks",
      listTasks: "tasks.listTasks",
      moveTask: "tasks.moveTask",
      unscheduleTask: "tasks.unscheduleTask",
      reorderTasks: "tasks.reorderTasks",
      reorderInboxTasks: "tasks.reorderInboxTasks",
      addTask: "tasks.addTask",
    },
    goalProgress: { list: "goalProgress.list", prepare: "goalProgress.prepare" },
    goals: {
      list: "goals.list",
      listLinks: "goals.listLinks",
      upsert: "goals.upsert",
      bulkUpsert: "goals.bulkUpsert",
      remove: "goals.remove",
    },
    sync: {
      upsertIntegration: "sync.upsertIntegration",
    },
  },
}));

vi.mock("../components/GoogleCallback", () => ({
  GoogleCallback: () => null,
}));

vi.mock("../components/settings/SettingsPage", () => ({
  SettingsPage: ({ onBack }: { onBack: () => void }) => (
    <div>
      <h2>Settings Page</h2>
      <button onClick={onBack}>Close Settings</button>
    </div>
  ),
}));

vi.mock("../hooks/useBootstrapUser", () => ({
  useBootstrapUser: () => true,
}));

import { App } from "../App";

function makeTask(overrides: Partial<Task>): Task {
  return {
    _id: "task_1" as Id<"tasks">,
    title: "Task",
    position: 0,
    scheduledAt: 1,
    createdBy: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("App task flow integration", () => {
  beforeEach(() => {
    localStorage.removeItem("pravah:ff:web-goals-linking");
    sessionStorage.clear();
    useQueryMock.mockReset();
    useMutationMock.mockReset();

    useMutationMock.mockImplementation(() => vi.fn().mockResolvedValue(undefined));
  });

  it("renders authenticated app shell", async () => {
    const today = getLocalDateString();
    useQueryMock.mockReturnValue([
      makeTask({ _id: "inbox_1" as Id<"tasks">, title: "Inbox Task" }),
      makeTask({
        _id: "scheduled_1" as Id<"tasks">,
        title: "Scheduled Task",
        deadline: today,
      }),
    ]);

    renderWithProviders(<App />);

    expect(await screen.findByRole("button", { name: "Settings" })).toBeEnabled();
    expect(screen.getAllByText("Timeline").length).toBeGreaterThan(0);
  });

  it("keeps app responsive to keyboard events", async () => {
    useQueryMock.mockReturnValue([]);

    renderWithProviders(<App />);

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Settings" })).toBeEnabled();
    });
  });

  it("renders without crashing when scheduled tasks exist", async () => {
    const today = getLocalDateString();
    useQueryMock.mockReturnValue([
      makeTask({
        _id: "scheduled_1" as Id<"tasks">,
        title: "Click Me",
        deadline: today,
      }),
    ]);

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getByText("Click Me")).toBeInTheDocument();
    });
  });

  it("shows the Insights loading layout until completion history arrives", async () => {
    useQueryMock.mockImplementation((ref, args) => ref === "tasks.listTasks" && args?.status === "completed" ? undefined : []);
    renderWithProviders(<App />);
    fireEvent.click(await screen.findByRole("button", { name: "Insights" }));
    expect(screen.getByRole("status", { name: "Loading insights" })).toBeInTheDocument();
    expect(screen.queryByText(/tasks tracked/)).not.toBeInTheDocument();
  });

});
