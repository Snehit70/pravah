export const TAB_KEYS = ["inbox", "timeline", "goals", "insights"] as const;

export type TabKey = (typeof TAB_KEYS)[number];
export type TabOrder = TabKey[];

export const DEFAULT_TAB_ORDER: TabOrder = [...TAB_KEYS];

export function getDefaultTabOrder(): TabOrder {
  return [...DEFAULT_TAB_ORDER];
}

export function isCurrentTabOrderDragSession(
  currentSession: number,
  candidateSession: number,
) {
  return Number.isInteger(candidateSession) && candidateSession >= currentSession;
}

export function nextTabOrderDragSession(currentSession: number) {
  return Math.max(0, currentSession) + 1;
}

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

export function resolveStartupTab(value: unknown): TabKey {
  return resolveTabOrder(value)[0] ?? DEFAULT_TAB_ORDER[0];
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

export function reorderTabOrder(
  order: readonly TabKey[],
  fromIndex: number,
  toIndex: number,
): TabOrder {
  const next = sanitizeTabOrder(order);
  if (
    !Number.isInteger(fromIndex) ||
    !Number.isInteger(toIndex) ||
    fromIndex < 0 ||
    fromIndex >= next.length ||
    toIndex < 0 ||
    toIndex >= next.length ||
    fromIndex === toIndex
  ) {
    return next;
  }
  const moved = next[fromIndex];
  if (!moved) return next;
  next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export const TAB_ORDER_CAPTURE_WIDTH = 48;
export const TAB_ORDER_PREVIEW_GAP = 4;
export const TAB_ORDER_GESTURE_ACTIVE_OFFSET_X = [-8, 8] as const;
export const TAB_ORDER_GESTURE_FAIL_OFFSET_Y = [-12, 12] as const;

export function tabOrderSlotOffset(
  index: number,
  slotWidth: number,
  captureWidth = 48,
  gap = 4,
) {
  "worklet";
  return (
    index * (slotWidth + gap) +
    (index >= 2 ? captureWidth + gap : 0)
  );
}

export function tabOrderTargetIndex(
  fromIndex: number,
  translation: number,
  orderLength: number,
  slotWidth: number,
  captureWidth = 48,
  gap = 4,
) {
  "worklet";
  if (slotWidth <= 0) return fromIndex;
  let targetIndex = fromIndex;
  let closestDistance = Number.POSITIVE_INFINITY;
  const fromOffset = tabOrderSlotOffset(fromIndex, slotWidth, captureWidth, gap);
  for (let index = 0; index < orderLength; index += 1) {
    const distance = Math.abs(
      translation - (tabOrderSlotOffset(index, slotWidth, captureWidth, gap) - fromOffset),
    );
    if (distance < closestDistance) {
      closestDistance = distance;
      targetIndex = index;
    }
  }
  return targetIndex;
}

export function tabOrderVisualIndex(
  sourceIndex: number,
  activeSourceIndex: number,
  activeTargetIndex: number,
) {
  "worklet";
  if (activeSourceIndex < 0 || activeTargetIndex < 0) return sourceIndex;
  if (sourceIndex === activeSourceIndex) return activeTargetIndex;
  if (
    activeSourceIndex < activeTargetIndex &&
    sourceIndex > activeSourceIndex &&
    sourceIndex <= activeTargetIndex
  ) {
    return sourceIndex - 1;
  }
  if (
    activeSourceIndex > activeTargetIndex &&
    sourceIndex >= activeTargetIndex &&
    sourceIndex < activeSourceIndex
  ) {
    return sourceIndex + 1;
  }
  return sourceIndex;
}
