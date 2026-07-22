import type { ReflowAssignment } from "./reflow";

export type ManualTriageTarget =
  | "today"
  | "tomorrow"
  | "week"
  | "drop"
  | { date: string };

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
  planToken: string;
  tasks: OverduePreviewTask[];
};

export type OverduePreviewOrphan = {
  taskId: string;
  title: string;
  deadline?: string;
};

export type OverduePreviewData = {
  totalOverdue: number;
  groups: OverduePreviewGroup[];
  orphans: OverduePreviewOrphan[];
  planToken: string;
};
