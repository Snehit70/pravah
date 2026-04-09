/** @vitest-environment happy-dom */
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Task } from "../types";
import type { Id } from "../../convex/_generated/dataModel";
import { getLocalDateString } from "../lib/utils";

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
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    tasks: {
      listTasks: "tasks.listTasks",
      moveTask: "tasks.moveTask",
      reorderTasks: "tasks.reorderTasks",
      addTask: "tasks.addTask",
    },
    sync: {
      upsertIntegration: "sync.upsertIntegration",
    },
  },
}));

vi.mock("../components/GoogleCallback", () => ({
  GoogleCallback: () => null,
}));

vi.mock("../components/QuickAdd", () => ({
  QuickAdd: ({ onClose }: { onClose: () => void }) => (
    <div>
      <h2>Quick Add Modal</h2>
      <button onClick={onClose}>Close Quick Add</button>
    </div>
  ),
}));

vi.mock("../components/TaskPopup", () => ({
  TaskPopup: ({ task, onClose }: { task: Task; onClose: () => void }) => (
    <div>
      <h2>Task Popup</h2>
      <p>{task.title}</p>
      <button onClick={onClose}>Close Task Popup</button>
    </div>
  ),
}));

vi.mock("../components/Settings", () => ({
  Settings: ({ onClose }: { onClose: () => void }) => (
    <div>
      <h2>Settings Modal</h2>
      <button onClick={onClose}>Close Settings</button>
    </div>
  ),
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
    useQueryMock.mockReset();
    useMutationMock.mockReset();

    useMutationMock.mockImplementation(() => vi.fn().mockResolvedValue(undefined));
  });

  it("renders inbox and timeline tasks from query data", () => {
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

    render(<App />);

    expect(screen.getByText("Inbox Task")).toBeInTheDocument();
    expect(screen.getByText("Scheduled Task")).toBeInTheDocument();
  });

  it("opens and closes quick add via keyboard shortcut", async () => {
    useQueryMock.mockReturnValue([]);

    render(<App />);

    fireEvent.keyDown(window, { key: "n", metaKey: true });

    await waitFor(() => {
      expect(screen.getByText("Quick Add Modal")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Close Quick Add" }));

    await waitFor(() => {
      expect(screen.queryByText("Quick Add Modal")).not.toBeInTheDocument();
    });
  });

  it("opens and closes task popup when task is clicked", async () => {
    const today = getLocalDateString();
    useQueryMock.mockReturnValue([
      makeTask({
        _id: "scheduled_1" as Id<"tasks">,
        title: "Click Me",
        scheduledDate: today,
        status: "scheduled",
      }),
    ]);

    render(<App />);

    fireEvent.click(screen.getByText("Click Me"));

    await waitFor(() => {
      expect(screen.getByText("Task Popup")).toBeInTheDocument();
      expect(screen.getAllByText("Click Me").length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole("button", { name: "Close Task Popup" }));

    await waitFor(() => {
      expect(screen.queryByText("Task Popup")).not.toBeInTheDocument();
    });
  });
});
