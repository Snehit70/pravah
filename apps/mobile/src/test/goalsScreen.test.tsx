/** @vitest-environment happy-dom */
/**
 * GoalsScreen tests: the list card and the detail-sheet workbench.
 *
 * The list card is deliberately a *row*, not a preview of the detail sheet:
 * flag tile, title, the progress rule under it, then one meta line reading
 * "P1 · 2 of 11 done" with the plan action. These tests pin the deletions as
 * hard as the additions — the failure mode is content creeping back on.
 *
 * The focused goal workspace groups open tasks Overdue/Today/Later/No date
 * (ordering itself is pinned in goalTasks.test.ts), separates finished work
 * behind a Done tab, keeps Add task persistent, and leaves goal identity
 * fields behind the pencil in GoalSettingsSheet.
 *
 * Strategy: mock react-native + FlatList with DOM equivalents and drive the
 * assertions through @testing-library queries.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

// ─── react-native mock ────────────────────────────────────────────────────────
vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  // RN props with no DOM meaning. Dropped so React doesn't warn on them.
  const DROP = new Set([
    "style",
    "hitSlop",
    "accessible",
    "accessibilityState",
    "accessibilityValue",
    "numberOfLines",
    "onLongPress",
    "showsVerticalScrollIndicator",
  ]);
  // Translate RN accessibility props to ARIA so @testing-library's
  // *ByLabelText queries see what a screen reader would see.
  const strip = (rest: AnyProps): AnyProps => {
    const out: AnyProps = {};
    for (const [key, value] of Object.entries(rest)) {
      if (DROP.has(key)) continue;
      if (key === "accessibilityLabel") out["aria-label"] = value;
      else if (key === "accessibilityRole") out.role = value;
      else out[key] = value;
    }
    return out;
  };
  const View = ({ children, ...rest }: AnyProps) =>
    React.createElement("div", strip(rest), children);
  const Text = ({ children, ...rest }: AnyProps) =>
    React.createElement("span", strip(rest), children);
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const { onPress, ...safe } = strip(rest) as AnyProps & { onPress?: () => void };
    return React.createElement(
      "button",
      { ...safe, onClick: onPress },
      Object.prototype.toString.call(children) === "[object Function]"
        ? (children as unknown as (s: unknown) => React.ReactNode)({ pressed: false })
        : children
    );
  };
  const FlatList = ({
    data,
    renderItem,
    keyExtractor,
    ListHeaderComponent,
    ListEmptyComponent,
    ListFooterComponent,
  }: {
    data: unknown[];
    renderItem: (p: { item: unknown; index: number }) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
    ListHeaderComponent?: React.ReactNode;
    ListEmptyComponent?: React.ReactNode;
    ListFooterComponent?: React.ReactNode;
    [key: string]: unknown;
  }) => {
    if (data.length === 0 && ListEmptyComponent) {
      return React.createElement("div", { "data-testid": "flatlist" }, ListEmptyComponent);
    }
    return React.createElement(
      "div",
      { "data-testid": "flatlist" },
      ListHeaderComponent,
      data.map((item, index) =>
        React.createElement(
          "div",
          { key: keyExtractor(item), "data-testid": `goal-item-${index}` },
          renderItem({ item, index })
        )
      ),
      ListFooterComponent
    );
  };
  const Modal = ({ children, visible }: AnyProps & { visible?: boolean }) =>
    visible ? React.createElement("div", {}, children) : null;
  const ScrollView = ({ children }: AnyProps) => React.createElement("div", {}, children);
  const TextInput = () => React.createElement("input", {});
  return {
    View,
    Text,
    Pressable,
    FlatList,
    Modal,
    ScrollView,
    TextInput,
    BackHandler: { addEventListener: () => ({ remove: vi.fn() }) },
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  };
});

vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
  },
  FadeIn: { duration: () => undefined },
  FadeInDown: { duration: () => ({ delay: () => undefined }) },
  FadeOut: { duration: () => undefined },
  Easing: { out: () => undefined, cubic: undefined },
  interpolateColor: () => "transparent",
  useAnimatedStyle: () => ({}),
  useSharedValue: (v: unknown) => ({ value: v }),
  withSpring: (v: unknown) => v,
  withTiming: (v: unknown) => v,
}));

vi.mock("react-native-svg", () => {
  const Stub = ({ children }: { children?: React.ReactNode }) =>
    React.createElement("svg", {}, children);
  return { __esModule: true, default: Stub, Svg: Stub, Path: Stub, Circle: Stub, Line: Stub };
});

vi.mock("react-native-gesture-handler/ReanimatedSwipeable", () => ({
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", {}, children),
}));

vi.mock("expo-blur", () => ({
  BlurView: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", {}, children),
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("../assets/icons/nav-goals.svg", () => ({
  default: () => React.createElement("svg", { "data-testid": "goal-icon" }),
}));
vi.mock("../assets/icons/add-new-goal.svg", () => ({
  default: () => React.createElement("svg", { "data-testid": "add-new-goal-icon" }),
}));
vi.mock("../assets/icons/add-new-task.svg", () => ({
  default: () => React.createElement("svg", { "data-testid": "add-new-task-icon" }),
}));

vi.mock("../lib/haptic", () => ({ haptic: { light: vi.fn(), success: vi.fn() } }));
vi.mock("../hooks/useConfirm", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("../hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
vi.mock("../hooks/useGoalMutations", () => ({
  useGoalMutations: () => ({ deleteGoal: vi.fn(), setGoalLink: vi.fn(), updateGoal: vi.fn() }),
}));
vi.mock("../components/TaskCard", () => ({
  TaskCard: ({ task }: { task: { title: string } }) =>
    React.createElement("div", {}, task.title),
}));
vi.mock("../components/SlidingSegmented", () => ({
  SlidingSegmented: ({
    options,
    onSelect,
  }: {
    options: Array<{ value: string; label: string }>;
    onSelect: (value: string) => void;
  }) =>
    React.createElement(
      "div",
      {},
      options.map((option) =>
        React.createElement(
          "button",
          {
            key: option.value,
            onClick: () => onSelect(option.value),
            role: "tab",
            "aria-label": option.label,
          },
          option.label
        )
      )
    ),
}));

const goals = [
  { id: "g1", text: "Mad 2 project", description: "Mad 2 college project", priority: "p1", createdAt: 1 },
  { id: "g2", text: "Kairo tool-calling rebuild", createdAt: 2 },
];

vi.mock("../hooks/useGoals", () => ({
  useGoals: () => ({ goals, isHydrated: true }),
  useGoalLinks: () => ({ t1: "g1", t2: "g1", t3: "g1", t4: "g1" }),
}));

import { GoalsScreen } from "../screens/GoalsScreen";

const task = (id: string, completed: boolean, deadline?: string) => ({
  _id: id,
  title: `Task ${id}`,
  deadline,
  scheduledAt: 0,
  completedAt: completed ? 1 : undefined,
  position: 0,
  updatedAt: 1,
  createdAt: 1,
});

// One finished, one overdue, one undated, one far future — enough to exercise
// every group the sheet can render.
const tasks = [
  task("t1", true),
  task("t2", false, "2000-02-03"),
  task("t3", false),
  task("t4", false, "2999-05-06"),
] as never;

const openG1Sheet = () => {
  fireEvent.click(
    screen.getByLabelText("Goal: Mad 2 project. Priority P1. 1 of 4 done. Open goal details.")
  );
};

describe("GoalsScreen card (variant D2)", () => {
  it("reads priority twice — as a label, not hue alone", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    // The letters must be present; a coloured dot alone would leave a
    // deuteranope with P1/P2 at ΔE 6.4.
    expect(screen.getByText("P1")).toBeTruthy();
  });

  it("states progress in words on the meta line", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    expect(screen.getByText("1 of 4 done")).toBeTruthy();
  });

  it("says so plainly when a goal has no linked tasks", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    expect(screen.getByText("No tasks linked")).toBeTruthy();
  });

  it("drops the description, next-task box and 'In progress' the sheet already owns", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    expect(screen.queryByText("Mad 2 college project")).toBeNull();
    expect(screen.queryByText("Next task")).toBeNull();
    expect(screen.queryByText("In progress")).toBeNull();
    // The old count format lived opposite the title; the meta line owns it now.
    expect(screen.queryByText("1/4")).toBeNull();
  });

  it("keeps the plan action on every row", () => {
    const onCreateTaskForGoal = vi.fn();
    render(
      <GoalsScreen tabBarHeight={0} tasks={tasks} onCreateTaskForGoal={onCreateTaskForGoal} />
    );
    fireEvent.click(screen.getAllByLabelText(/^Plan next task for/)[0]);
    expect(onCreateTaskForGoal).toHaveBeenCalledWith("g1");
  });

  it("omits the plan action when the screen cannot create tasks", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    expect(screen.queryByLabelText(/^Plan next task for/)).toBeNull();
  });

  it("announces priority and progress to a screen reader on the row itself", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    expect(
      screen.getByLabelText("Goal: Mad 2 project. Priority P1. 1 of 4 done. Open goal details.")
    ).toBeTruthy();
  });
});

describe("GoalDetailSheet workbench", () => {
  it("renders the goal's title and description in the sheet header", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    openG1Sheet();
    // Card + sheet header both carry the title; the description only renders
    // in the sheet (the card test above pins its absence from the list).
    expect(screen.getAllByText("Mad 2 project").length).toBe(2);
    expect(screen.getByText("Mad 2 college project")).toBeTruthy();
  });

  it("groups scheduled work under Next and undated work under Unscheduled", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    openG1Sheet();
    const text = document.body.textContent ?? "";
    const sequence = ["Next", "Task t2", "Task t4", "Unscheduled 1", "Task t3"];
    const positions = sequence.map((s) => text.indexOf(s));
    for (const [i, pos] of positions.entries()) {
      expect(pos, `"${sequence[i]}" missing from sheet`).toBeGreaterThan(-1);
    }
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("exposes the concept's sort control with plan and newest ordering", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    openG1Sheet();
    fireEvent.click(screen.getByLabelText("Sort goal tasks"));
    expect(screen.getByText("Plan order")).toBeTruthy();
    expect(screen.getByText("Newest added")).toBeTruthy();
  });

  it("separates finished tasks behind the Done tab", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    openG1Sheet();
    expect(screen.queryByText("Task t1")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Done 1" }));
    expect(screen.getByText("Task t1")).toBeTruthy();
  });

  it("makes the date chip the schedule affordance; undated rows get the calendar", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} onScheduleToDate={vi.fn()} />);
    openG1Sheet();
    expect(screen.getByLabelText("Reschedule Task t2, currently Feb 3")).toBeTruthy();
    expect(screen.getByLabelText("Schedule Task t3")).toBeTruthy();
  });

  it("keeps the goal workspace mounted when a linked task opens", () => {
    const onOpenTask = vi.fn();
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} onOpenTask={onOpenTask} />);
    openG1Sheet();
    fireEvent.click(screen.getByText("Task t3"));
    expect(onOpenTask).toHaveBeenCalledWith(expect.objectContaining({ _id: "t3" }));
    expect(screen.getByLabelText("Back to goals")).toBeTruthy();
    expect(screen.getByText("Mad 2 college project")).toBeTruthy();
  });

  it("exposes one persistent add-task action inside the goal", () => {
    const onCreateTaskForGoal = vi.fn();
    render(
      <GoalsScreen tabBarHeight={0} tasks={tasks} onCreateTaskForGoal={onCreateTaskForGoal} />
    );
    openG1Sheet();
    fireEvent.click(screen.getByLabelText("Add task to Mad 2 project"));
    expect(onCreateTaskForGoal).toHaveBeenCalledWith("g1");
    expect(screen.getByLabelText("Back to goals")).toBeTruthy();
  });

  it("keeps the goal's identity fields and delete behind the pencil", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    openG1Sheet();
    expect(screen.queryByLabelText(/^Delete goal/)).toBeNull();
    fireEvent.click(screen.getByLabelText("Goal settings"));
    expect(screen.getByText("Goal settings")).toBeTruthy();
    expect(screen.getByLabelText("Delete goal Mad 2 project")).toBeTruthy();
  });

  it("drops the edit hint and the per-row Unlink buttons", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    openG1Sheet();
    expect(screen.queryByText(/Tap Edit to change/)).toBeNull();
    expect(screen.queryByText("Unlink")).toBeNull();
  });
});
