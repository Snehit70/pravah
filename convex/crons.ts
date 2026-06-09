import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Purge soft-deleted tasks past their 30-minute undo window. Runs every
// 5 minutes — short enough that purged tasks don't linger long after the
// window expires, but cheap enough not to thrash a small workspace.
crons.interval(
  "purge expired cancelled tasks",
  { minutes: 5 },
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
