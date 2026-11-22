/**
 * Deep links the widget opens and the app understands.
 *
 * The scheme matches `scheme` in app.config.ts for the prod and dev variants.
 * The widget library pins OPEN_URI intents to the app's own package, so dev and
 * prod installs on one phone each open themselves. The CI-only e2e variant uses
 * another scheme and ships no widget flows.
 */
export const WIDGET_LINK_SCHEME = "pravah";

export type WidgetLinkTarget =
  | { kind: "capture" }
  | { kind: "today" }
  | { kind: "inbox" }
  | { kind: "task"; taskId: string };

export function widgetLink(kind: "capture" | "today" | "inbox"): string;
export function widgetLink(kind: "task", taskId: string): string;
export function widgetLink(kind: WidgetLinkTarget["kind"], taskId?: string): string {
  if (kind === "task") return `${WIDGET_LINK_SCHEME}://task/${encodeURIComponent(taskId ?? "")}`;
  return `${WIDGET_LINK_SCHEME}://${kind}`;
}

/** Parses an incoming URL. Anything that is not a widget link returns null. */
export function parseWidgetLink(url: string | null | undefined): WidgetLinkTarget | null {
  if (!url) return null;
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^?#]*)/i.exec(url.trim());
  if (!match || match[1].toLowerCase() !== WIDGET_LINK_SCHEME) return null;
  const segments = match[2].split("/").filter(Boolean);
  const [head, id] = segments;
  if (head === "capture" && segments.length === 1) return { kind: "capture" };
  if (head === "today" && segments.length === 1) return { kind: "today" };
  if (head === "inbox" && segments.length === 1) return { kind: "inbox" };
  if (head === "task" && segments.length === 2 && id) {
    try {
      const taskId = decodeURIComponent(id);
      return taskId ? { kind: "task", taskId } : null;
    } catch {
      return null;
    }
  }
  return null;
}
