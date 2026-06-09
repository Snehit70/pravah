import type { CredentialSummary, MockGoal, MockTask } from "./types";

export const mockCredential: CredentialSummary = {
  userId: "user_01",
  email: "snehit@example.com",
  credentialLabel: "local-dev",
  scopes: ["tasks:read", "tasks:write", "review:read", "sync:read"],
  siteUrl: "https://pravah.local",
};

export const mockTasks: MockTask[] = [
  {
    id: "task_1",
    title: "Review overdue goals",
    status: "scheduled",
    deadline: "2026-06-04",
    scheduledAt: 1780000000000,
    goal: { id: "goal_1", title: "Planning" },
  },
  {
    id: "task_2",
    title: "Draft CLI contract",
    status: "inbox",
    scheduledAt: 1780000100000,
    goal: { id: "goal_1", title: "Planning" },
  },
  {
    id: "task_3",
    title: "Ship auth settings UI",
    status: "scheduled",
    deadline: "2026-06-05",
    scheduledAt: 1780000200000,
    goal: { id: "goal_2", title: "Automation" },
  },
];

export const mockGoals: MockGoal[] = [
  {
    id: "goal_1",
    text: "Planning",
    description: "Keep planning loops tight and visible.",
    priority: "p1",
    createdAt: 1780000000000,
  },
  {
    id: "goal_2",
    text: "Automation",
    description: "Make Pravah useful to local agents.",
    priority: "p1",
    createdAt: 1780000100000,
  },
];

export const mockGoalLinks = Object.fromEntries(
  mockTasks.flatMap((task) => (task.goal ? [[task.id, task.goal.id]] : []))
);

export const mockReviewQueue = [
  { id: "review_1", title: "Reply to recruiter", status: "pending", source: "gmail" },
  { id: "review_2", title: "Confirm dentist appointment", status: "pending", source: "gmail" },
];

export const mockSyncStatus = {
  provider: "google_calendar",
  healthy: true,
  lastRunAt: "2026-06-04T12:30:00.000Z",
  pendingReviewItems: mockReviewQueue.length,
};
