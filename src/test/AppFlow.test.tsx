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
  AuthLoading: ({ children }: { children: ReactNode }) => <>{children}</>,
  Authenticated: ({ children }: { children: ReactNode }) => <>{children}</>,
  Unauthenticated: () => null,
  useConvexAuth: () => ({ isAuthenticated: true, isLoading: false }),
  useConvexConnectionState: () => ({
    isWebSocketConnected: true,
    hasInflightRequests: false,
    connectionCount: 1,
  }),
  useQuery: (...args: unknown[]) => useQueryMock(...args),
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
    goals: {
      list: "goals.list",
      listLinks: "goals.listLinks",
    },
    sync: {
      upsertIntegration: "sync.upsertIntegration",
    },
  },
}));

vi.mock("../components/GoogleCallback", () => ({
  GoogleCallback: () => null,
}));

vi.mock("../components/Settings", () => ({
  Settings: ({ onClose }: { onClose: () => void }) => (
    <div>
      <h2>Settings Modal</h2>
      <button onClick={onClose}>Close Settings</button>
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
    type: "open",
    position: 0,
    status: "scheduled",
    createdBy: "user",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("App task flow integration", () => {
  beforeEach(() => {
    localStorage.removeItem("pravah:ff:web-goals-linking");
    useQueryMock.mockReset();
    useMutationMock.mockReset();

    useMutationMock.mockImplementation(() => vi.fn().mockResolvedValue(undefined));
  });

  it("renders authenticated app shell", () => {
    const today = getLocalDateString();
    useQueryMock.mockReturnValue([
      makeTask({ _id: "inbox_1" as Id<"tasks">, title: "Inbox Task", status: "inbox" }),
      makeTask({
        _id: "scheduled_1" as Id<"tasks">,
        title: "Scheduled Task",
        scheduledDate: today,
        status: "scheduled",
      }),
    ]);

    renderWithProviders(<App />);

    expect(screen.getAllByText("Pravah").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Timeline").length).toBeGreaterThan(0);
  });

  it("keeps app responsive to keyboard events", async () => {
    useQueryMock.mockReturnValue([]);

    renderWithProviders(<App />);

    fireEvent.keyDown(window, { key: "n", ctrlKey: true });
    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.getAllByText("Pravah").length).toBeGreaterThan(0);
    });
  });

  it("renders without crashing when scheduled tasks exist", async () => {
    const today = getLocalDateString();
    useQueryMock.mockReturnValue([
      makeTask({
        _id: "scheduled_1" as Id<"tasks">,
        title: "Click Me",
        scheduledDate: today,
        status: "scheduled",
      }),
    ]);

    renderWithProviders(<App />);

    await waitFor(() => {
      expect(screen.getAllByText("Pravah").length).toBeGreaterThan(0);
    });
  });

});
