/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import type { Task } from "../types";
import type { Id } from "../../convex/_generated/dataModel";
import { InboxSidebar } from "../components/InboxSidebar";

vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({ setNodeRef: () => undefined, isOver: false }),
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
  arrayMove: <T,>(arr: T[]) => arr,
  verticalListSortingStrategy: () => null,
}));

vi.mock("@dnd-kit/utilities", () => ({
  CSS: {
    Transform: {
      toString: () => "",
    },
  },
}));

function makeTask(overrides: Partial<Task>): Task {
  return {
    _id: "task_1" as Id<"tasks">,
    title: "Inbox Task",
    type: "open",
    position: 0,
    status: "inbox",
    createdBy: "user",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("InboxSidebar", () => {
  it("renders linked goal badge when mapping is provided", () => {
    render(
      <InboxSidebar
        tasks={[makeTask({ _id: "inbox_1" as Id<"tasks">, title: "Task linked to goal" })]}
        goalNameByTaskId={{ inbox_1: "Deep Work Goal" }}
        onTaskClick={vi.fn()}
      />
    );

    expect(screen.getByText(/Deep Work Goal/)).toBeInTheDocument();
  });
});

