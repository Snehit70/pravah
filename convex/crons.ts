import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Purge soft-deleted tasks past their 30-minute undo window. The purge and
// tombstone retry paths schedule reconciliation only when cleanup work exists;
// keep this maintenance sweep at the existing 72-hour cadence to avoid hourly
// Convex reads for an otherwise idle workspace.
crons.interval(
  "purge expired cancelled tasks",
  { hours: 72 },
  internal.tasks.purgeExpiredCancelledTasks,
  {}
);

crons.interval(
  "purge expired automation idempotency keys",
  { hours: 1 },
  internal.automationIdempotency.purgeExpired,
  {}
);

crons.interval(
  "refresh Task-image provider usage",
  { hours: 6 },
  internal.taskImageActions.refreshProviderUsage,
  {}
);

export default crons;
