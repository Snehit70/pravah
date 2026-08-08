import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Purge soft-deleted tasks past their 30-minute undo window and enqueue image
// cleanup without making provider calls inside a database mutation.
crons.interval(
  "purge expired cancelled tasks",
  { hours: 1 },
  internal.tasks.purgeExpiredCancelledTasks,
  {}
);

crons.interval(
  "reconcile task image cleanup",
  { hours: 1 },
  internal.taskImageActions.reconcileCleanup,
  {}
);

crons.interval(
  "purge expired automation idempotency keys",
  { hours: 1 },
  internal.automationIdempotency.purgeExpired,
  {}
);

export default crons;
