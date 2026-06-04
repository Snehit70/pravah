import type { CredentialSummary, MockTask } from "./types";

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
    scheduledDate: "2026-06-04",
    goal: { id: "goal_1", title: "Planning" },
  },
  {
    id: "task_2",
    title: "Draft CLI contract",
    status: "inbox",
    deadline: "2026-06-06",
    goal: { id: "goal_1", title: "Planning" },
  },
  {
    id: "task_3",
    title: "Ship auth settings UI",
    status: "scheduled",
    scheduledDate: "2026-06-05",
    deadline: "2026-06-07",
    goal: { id: "goal_2", title: "Automation" },
  },
];

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
