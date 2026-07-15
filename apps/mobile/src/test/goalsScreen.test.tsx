/** @vitest-environment happy-dom */
/**
 * GoalsScreen card tests
 *
 * The list card is deliberately a *row*, not a preview of the detail sheet:
 * flag tile, title, the progress rule under it, then one meta line reading
 * "P1 · 2 of 11 done" with the plan action. Description, the next-task box,
 * the chevron and the "In progress" string were removed because the sheet
 * already carries all of them.
 *
 * These tests pin the deletions as hard as the additions — the failure mode
 * this redesign guards against is content creeping back onto the row.
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
      typeof children === "function"
        ? (children as (s: unknown) => React.ReactNode)({ pressed: false })
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
    StyleSheet: { create: (s: unknown) => s, hairlineWidth: 1 },
  };
});

vi.mock("react-native-reanimated", () => ({
  default: {
    View: ({ children }: { children?: React.ReactNode }) => React.createElement("div", {}, children),
  },
  FadeIn: { duration: () => undefined },
  FadeInDown: { duration: () => ({ delay: () => undefined }) },
  Easing: { out: () => undefined, cubic: undefined },
  useAnimatedStyle: () => ({}),
  useSharedValue: (v: unknown) => ({ value: v }),
  withTiming: (v: unknown) => v,
}));

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

vi.mock("../assets/icons/nav-goals.svg", () => ({
  default: () => React.createElement("svg", { "data-testid": "goal-icon" }),
}));

vi.mock("../lib/haptic", () => ({ haptic: { light: vi.fn(), success: vi.fn() } }));
vi.mock("../hooks/useConfirm", () => ({ useConfirm: () => vi.fn(async () => true) }));
vi.mock("../hooks/useReducedMotion", () => ({ useReducedMotion: () => true }));
vi.mock("../hooks/useGoalMutations", () => ({
  useGoalMutations: () => ({ deleteGoal: vi.fn(), setGoalLink: vi.fn(), updateGoal: vi.fn() }),
}));

const goals = [
  { id: "g1", text: "Mad 2 project", description: "Mad 2 college project", priority: "p1", createdAt: 1 },
  { id: "g2", text: "Kairo tool-calling rebuild", createdAt: 2 },
];

vi.mock("../hooks/useGoals", () => ({
  useGoals: () => ({ goals, isHydrated: true }),
  useGoalLinks: () => ({ t1: "g1", t2: "g1", t3: "g1" }),
}));

import { GoalsScreen } from "../screens/GoalsScreen";

const task = (id: string, completed: boolean) => ({
  _id: id,
  title: `Task ${id}`,
  scheduledAt: 0,
  completedAt: completed ? 1 : undefined,
  position: 0,
  updatedAt: 1,
  createdAt: 1,
});

const tasks = [task("t1", true), task("t2", false), task("t3", false)] as never;

describe("GoalsScreen card (variant D2)", () => {
  it("reads priority twice — as a label, not hue alone", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    // The letters must be present; a coloured dot alone would leave a
    // deuteranope with P1/P2 at ΔE 6.4.
    expect(screen.getByText("P1")).toBeTruthy();
  });

  it("states progress in words on the meta line", () => {
    render(<GoalsScreen tabBarHeight={0} tasks={tasks} />);
    expect(screen.getByText("1 of 3 done")).toBeTruthy();
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
    expect(screen.queryByText("1/3")).toBeNull();
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
      screen.getByLabelText("Goal: Mad 2 project. Priority P1. 1 of 3 done. Open goal details.")
    ).toBeTruthy();
  });
});
