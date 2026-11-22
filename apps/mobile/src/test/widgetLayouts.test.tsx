import { describe, expect, it, vi } from "vitest";

// The real library loads its native module on import. Stand in with
// primitives tagged the way its tree builder expects (`__name__`).
vi.mock("react-native-android-widget", () => {
  const primitive = (name: string) => {
    const component = ({ children }: { children?: unknown }) => children;
    component.__name__ = name;
    return component;
  };
  return {
    FlexWidget: primitive("LinearLayoutWidget"),
    TextWidget: primitive("TextWidget"),
    ImageWidget: primitive("ImageWidget"),
    ListWidget: primitive("ListWidget"),
    SvgWidget: primitive("SvgWidget"),
  };
});

// widgetRender reads the session and storage; layout tests need neither.
vi.mock("../widget/widgetRemote", () => ({ hasWidgetSession: async () => true }));
vi.mock("../widget/widgetStorage", () => ({
  readPendingCompletions: async () => [],
  readWidgetNotice: async () => null,
  readWidgetSnapshot: async () => null,
}));

import { renderWidgetByName } from "../widget/PravahWidgets";
import { WIDGET_NAMES } from "../widget/widgetNames";
import { buildWidgetSnapshot, buildWidgetView, type WidgetView } from "../widget/widgetModel";
import { widgetPalette } from "../widget/widgetTheme";
import { expandWidgetElement, renderWidget } from "../widget/widgetRender";

type Node = { type: string; props: Record<string, unknown>; children: Node[] };

/**
 * Mirrors react-native-android-widget's buildWidgetTree: call plain function
 * components until a primitive is reached. Fragments and `null` returns crash
 * the real builder, so they fail here too.
 */
function walk(element: unknown): Node {
  let current = element as { type: unknown; props: Record<string, unknown> } | null;
  while (current && typeof current.type === "function" && !(current.type as { __name__?: string }).__name__) {
    current = (current.type as (props: unknown) => typeof current)(current.props);
  }
  if (!current || typeof current.type !== "function") {
    throw new Error(`unsupported widget node: ${current === null ? "null" : String(current?.type)}`);
  }
  const { children, ...props } = current.props;
  const list = (Array.isArray(children) ? children : children ? [children] : []).filter(Boolean).flat(1);
  return { type: (current.type as unknown as { __name__: string }).__name__, props, children: list.map(walk) };
}

function collect(node: Node, out: Node[] = []): Node[] {
  out.push(node);
  for (const child of node.children) collect(child, out);
  return out;
}

const NOW = new Date(2026, 10, 22, 9, 30);
const day = (offset: number) => {
  const date = new Date(NOW);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
};

function viewFrom(input: {
  scheduled?: { _id: string; title: string; deadline: string; time?: string; priority?: "p1" }[];
  completed?: { _id: string; title: string; deadline: string; completedAt: number }[];
  inboxCount?: number;
  capturedAt?: Date;
  pending?: string[];
  notice?: string;
}): WidgetView {
  const snapshot = buildWidgetSnapshot({
    now: input.capturedAt ?? NOW,
    accent: "purple",
    theme: "system",
    inboxCount: input.inboxCount ?? 0,
    scheduledTasks: input.scheduled ?? [],
    completedTasks: input.completed ?? [],
  });
  return buildWidgetView({
    snapshot,
    signedIn: true,
    pending: (input.pending ?? []).map((taskId) => ({ taskId, title: taskId, at: NOW.getTime() })),
    notice: input.notice ? { message: input.notice, at: NOW.getTime() } : null,
    now: NOW,
  });
}

const busy = Array.from({ length: 12 }, (_, index) => ({
  _id: `t${index}`,
  title: `Task number ${index} with a fairly long title that should truncate`,
  deadline: index < 2 ? day(-2) : index < 10 ? day(0) : day(1),
  ...(index % 3 === 0 ? { time: `1${index % 10}:00` } : {}),
  ...(index === 4 ? { priority: "p1" as const } : {}),
}));

const states: Record<string, WidgetView> = {
  signedOut: { kind: "signedOut" },
  loading: { kind: "loading", dateLabel: "Sun 22 Nov" },
  busy: viewFrom({ scheduled: busy, inboxCount: 4 }),
  saving: viewFrom({ scheduled: busy, pending: ["t3", "t4"] }),
  allDone: viewFrom({
    completed: [{ _id: "d", title: "Done", deadline: day(0), completedAt: NOW.getTime() - 1000 }],
    scheduled: [{ _id: "n", title: "Tomorrow thing", deadline: day(1) }],
  }),
  emptyWithInbox: viewFrom({ inboxCount: 3 }),
  empty: viewFrom({}),
  stale: viewFrom({ scheduled: busy.slice(0, 3), capturedAt: new Date(NOW.getTime() - 6 * 3_600_000) }),
  rejected: viewFrom({ scheduled: busy.slice(0, 3), notice: "Couldn't complete · tap to open" }),
};

const sizes = [
  { width: 110, height: 110 },
  { width: 250, height: 110 },
  { width: 320, height: 180 },
  { width: 320, height: 392 },
  { width: 110, height: 40 },
  { width: 40, height: 40 },
];

describe("home-screen widget layouts", () => {
  for (const name of Object.values(WIDGET_NAMES)) {
    for (const [stateName, view] of Object.entries(states)) {
      it(`${name} renders the ${stateName} state in both themes at every size`, () => {
        for (const size of sizes) {
          for (const appearance of ["light", "dark"] as const) {
            const tree = walk(renderWidgetByName(name, { view, palette: widgetPalette(appearance, "teal"), size }));
            const nodes = collect(tree);
            expect(nodes.filter((node) => node.type === "ListWidget").length).toBeLessThanOrEqual(1);
            for (const node of nodes) {
              if (node.props.clickAction === "OPEN_URI") {
                expect(String((node.props.clickActionData as { uri?: string } | undefined)?.uri)).toMatch(/^pravah:\/\//);
              }
              const style = node.props.style as Record<string, unknown> | undefined;
              for (const key of ["color", "backgroundColor", "borderColor"]) {
                if (style?.[key] !== undefined) expect(style[key]).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
              }
            }
          }
        }
      });
    }
  }

  it("gives open rows a complete action carrying the task id, and done rows none", () => {
    const view = states.saving;
    const nodes = collect(
      walk(renderWidgetByName(WIDGET_NAMES.agenda, { view, palette: widgetPalette("light", "purple"), size: sizes[3] })),
    );
    const completes = nodes.filter((node) => node.props.clickAction === "PRAVAH_COMPLETE_TASK");
    const ids = completes.map((node) => (node.props.clickActionData as { taskId: string }).taskId);
    expect(ids).toContain("t0");
    expect(ids).not.toContain("t3");
    expect(ids).not.toContain("t4");
  });

  it("expands every widget to primitives inside renderWidget", () => {
    for (const widgetName of Object.values(WIDGET_NAMES)) {
      const tree = renderWidget({ widgetName, width: 320, height: 180 }, { view: states.busy, accent: "teal", theme: "system" });
      for (const element of [tree.light, tree.dark]) {
        const nodes = collect(walk(element));
        expect(nodes.length).toBeGreaterThan(1);
      }
    }
  });

  it("throws while expanding a tree the native builder would choke on", () => {
    const Broken = () => null;
    expect(() => expandWidgetElement({ type: Broken, props: {} })).toThrow();
  });
});
