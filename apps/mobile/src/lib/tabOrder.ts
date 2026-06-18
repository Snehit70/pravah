export const TAB_KEYS = ["inbox", "timeline", "goals", "insights"] as const;

export type TabKey = (typeof TAB_KEYS)[number];
export type TabOrder = TabKey[];

export const DEFAULT_TAB_ORDER: TabOrder = [...TAB_KEYS];

export const TAB_LABELS: Record<TabKey, string> = {
  inbox: "Inbox",
  timeline: "Timeline",
  goals: "Goals",
  insights: "Progress",
};

export function isTabKey(value: unknown): value is TabKey {
  return typeof value === "string" && (TAB_KEYS as readonly string[]).includes(value);
}

export function sanitizeTabOrder(value: unknown): TabOrder {
  if (!Array.isArray(value) || value.length !== TAB_KEYS.length) {
    return [...DEFAULT_TAB_ORDER];
  }
  const seen = new Set<TabKey>();
  for (const entry of value) {
    if (!isTabKey(entry) || seen.has(entry)) {
      return [...DEFAULT_TAB_ORDER];
    }
    seen.add(entry);
  }
  return [...value];
}

export function resolveTabOrder(value: unknown): TabOrder {
  return sanitizeTabOrder(value);
}

export function moveTabOrder(
  order: readonly TabKey[],
  key: TabKey,
  direction: "up" | "down",
): TabOrder {
  const next = sanitizeTabOrder(order);
  const index = next.indexOf(key);
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (index === -1 || targetIndex < 0 || targetIndex >= next.length) return next;
  [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
  return next;
}
