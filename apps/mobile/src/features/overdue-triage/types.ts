import type { ReflowAssignment } from "./reflow";

export type ManualTriageTarget = "today" | "tomorrow" | "week" | "drop";

export type ReflowCommitItem = {
  goalId: string;
  goalText: string;
  assignments: ReflowAssignment[];
  /** When set, the caller should also move the goal's deadline here. */
  newDeadline?: string;
};

export type OverduePreviewTask = {
  taskId: string;
  title: string;
  currentDate?: string;
  nextDate: string;
  changed: boolean;
};

export type OverduePreviewGroup = {
  goalId: string;
  goalText: string;
  goalDeadline?: string;
  overdueCount: number;
  movedCount: number;
  futureMovedCount: number;
  mode: "spread" | "march";
  projectedEnd: string;
  suggestedDeadline?: string;
  defaultApplyDeadline: boolean;
  assignments: ReflowAssignment[];
  tasks: OverduePreviewTask[];
};
