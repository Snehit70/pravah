import type { Id } from "../convex/_generated/dataModel";

export interface Task {
  _id: Id<"tasks">;
  title: string;
  description?: string;
  deadline?: string;
  scheduledAt: number;
  completedAt?: number;
  cancelledAt?: number;
  position: number;
  source?: "manual" | "ai-agent" | "gmail" | "gcal";
  estimatedMinutes?: number;
  tags?: string[];
  priority?: "p1" | "p2" | "p3";
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
