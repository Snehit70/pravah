/** @vitest-environment happy-dom */

import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  type AnyProps = Record<string, unknown> & { children?: React.ReactNode };
  const View = ({ children, ...rest }: AnyProps) => {
    const { style: _, ...safe } = rest;
    return React.createElement("div", safe, children);
  };
  const Text = ({ children, ...rest }: AnyProps) => {
    const { style: _, ...safe } = rest;
    return React.createElement("span", safe, children);
  };
  const Pressable = ({ children, ...rest }: AnyProps) => {
    const {
      onPress,
      style: _,
      hitSlop: __,
      accessibilityLabel,
      accessibilityRole: ___,
      accessibilityState,
      ...safe
    } = rest as AnyProps & {
      onPress?: () => void;
      accessibilityLabel?: string;
      accessibilityState?: { selected?: boolean };
    };
    const resolved =
      typeof children === "function"
        ? (children as (state: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      {
        ...safe,
        type: "button",
        onClick: onPress,
        "aria-label": accessibilityLabel,
        "aria-pressed": accessibilityState?.selected,
      },
      resolved,
    );
  };
  const ScrollView = ({ children }: AnyProps) => React.createElement("div", {}, children);
  const Modal = ({ visible, children }: AnyProps & { visible?: boolean }) =>
    visible ? React.createElement("div", { "data-testid": "history-modal" }, children) : null;
  const TextInput = ({
    value,
    onChangeText,
    placeholder,
  }: AnyProps & {
    value?: string;
    onChangeText?: (value: string) => void;
    placeholder?: string;
  }) =>
    React.createElement("input", {
      value: value ?? "",
      placeholder,
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        onChangeText?.(event.target.value),
    });
  const FlatList = ({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
  }: {
    data: unknown[];
    renderItem: (args: { item: unknown }) => React.ReactNode;
    keyExtractor: (item: unknown) => string;
    ListEmptyComponent?: React.ReactNode;
  }) =>
    React.createElement(
      "div",
      {},
      data.length
        ? data.map((item) =>
            React.createElement(
              "div",
              { key: keyExtractor(item) },
              renderItem({ item }),
            ),
          )
        : ListEmptyComponent,
    );
  const RefreshControl = () => null;
  const StyleSheet = {
    create: <T extends Record<string, unknown>>(styles: T): T => styles,
    hairlineWidth: 1,
  };
  return {
    FlatList,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
  };
});

vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

vi.mock("../hooks/useReducedMotion", () => ({
  useReducedMotion: () => false,
}));

import type { Id } from "../../../../convex/_generated/dataModel";
import { InsightsScreen } from "../screens/InsightsScreen";
import type { MobileTask } from "../components/TaskCard";

function task(id: string, title: string, completedAt?: number): MobileTask {
  return {
    _id: id as Id<"tasks">,
    title,
    scheduledAt: 1,
    completedAt,
    position: 0,
    updatedAt: completedAt ?? 1,
    createdAt: 1,
  };
}

describe("Progress screen", () => {
  const completed = [
    task("one", "Ship redesign", Date.now()),
    task("two", "Write release notes", Date.now() - 1000),
  ];

  it("shows momentum and recent completed Tasks without legacy subtabs", () => {
    render(
      <InsightsScreen
        tasks={completed}
        completedTasks={completed}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={vi.fn(async () => undefined)}
        renderCompletedTaskItem={({ item }) => <span>{item.title}</span>}
      />,
    );

    expect(screen.getByText("Recent momentum")).toBeTruthy();
    expect(screen.getByText("Recently completed")).toBeTruthy();
    expect(screen.getByText("Ship redesign")).toBeTruthy();
    expect(screen.queryByText("Insights")).toBeNull();
    expect(screen.queryByText("Done")).toBeNull();
  });

  it("opens searchable full-screen completion history", () => {
    render(
      <InsightsScreen
        tasks={completed}
        completedTasks={completed}
        isLoading={false}
        isRefreshing={false}
        tabBarHeight={60}
        onRefresh={vi.fn(async () => undefined)}
        renderCompletedTaskItem={({ item }) => <span>{item.title}</span>}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /view completion history/i }));
    expect(screen.getByText("Completion history")).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search completed Tasks"), {
      target: { value: "release" },
    });
    expect(screen.getAllByText("Write release notes").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Ship redesign")).toHaveLength(1);
  });
});
