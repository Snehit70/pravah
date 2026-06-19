/** @vitest-environment happy-dom */
import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";

// React Native's index.js ships in Flow syntax that vitest can't transform.
// Replace it with minimal DOM equivalents so the boundary's render output
// is inspectable as plain HTML in happy-dom.
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
  const Pressable = ({ children, ...rest }: AnyProps & { onPress?: () => void }) => {
    const { onPress, style: _, ...safe } = rest;
    const resolved =
      typeof children === "function"
        ? (children as (s: { pressed: boolean }) => React.ReactNode)({ pressed: false })
        : children;
    return React.createElement(
      "button",
      { ...safe, onClick: onPress, type: "button" },
      resolved,
    );
  };
  return {
    View,
    Text,
    Pressable,
    StyleSheet: { create: <T,>(s: T) => s, hairlineWidth: 1 },
  };
});

vi.mock("../lib/logger", () => ({
  classifyError: () => "render_error",
  describeErrorForDiagnostics: () => ({
    errorName: "Error",
    errorMessage: "intentional test crash",
  }),
  mobileLogger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

vi.mock("../theme/tokens", () => ({
  colors: {},
  radii: {},
  spacing: {},
  typography: {},
}));

import { ScreenErrorBoundary } from "../components/ScreenErrorBoundary";

function Boom(): React.ReactElement {
  throw new Error("intentional test crash");
}

describe("ScreenErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    render(
      <ScreenErrorBoundary screenName="Inbox">
        <span data-testid="ok">healthy child</span>
      </ScreenErrorBoundary>,
    );

    expect(screen.getByTestId("ok")).toBeTruthy();
    expect(screen.queryByText(/Reload tab/i)).toBeNull();
  });

  it("renders the local fallback when a child throws", () => {
    // React logs the caught error to the console — silence it so the
    // intentional crash doesn't pollute test output.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ScreenErrorBoundary screenName="Timeline">
        <Boom />
      </ScreenErrorBoundary>,
    );

    expect(screen.getByText(/Timeline fallback/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /reload tab/i })).toBeTruthy();

    errorSpy.mockRestore();
  });

  it("clears the fallback and re-renders children when retry is pressed", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    let shouldThrow = true;
    function MaybeBoom() {
      if (shouldThrow) throw new Error("first render fails");
      return <span data-testid="recovered">recovered child</span>;
    }

    render(
      <ScreenErrorBoundary screenName="Completed">
        <MaybeBoom />
      </ScreenErrorBoundary>,
    );

    // Fallback is shown for the initial throw.
    expect(screen.getByText(/Completed fallback/i)).toBeTruthy();

    // Fix the underlying render path and tap retry. The boundary should
    // reset hasError and re-render the (now-passing) child.
    shouldThrow = false;
    fireEvent.click(screen.getByRole("button", { name: /reload tab/i }));

    expect(screen.getByTestId("recovered")).toBeTruthy();
    expect(screen.queryByText(/Completed fallback/i)).toBeNull();

    errorSpy.mockRestore();
  });
});
