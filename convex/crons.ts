import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Purge soft-deleted tasks past their 30-minute undo window. Temporarily run
// every 72 hours to reduce database I/O while we revisit the cleanup strategy.
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

export default crons;
