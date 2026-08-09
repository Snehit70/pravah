export const TASK_IMAGE_USAGE_WARNING_PERCENT = 70;
export const TASK_IMAGE_USAGE_BLOCK_PERCENT = 85;
export const TASK_IMAGE_USAGE_RESUME_PERCENT = 75;
export const TASK_IMAGE_USAGE_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const TASK_IMAGE_USAGE_MAX_SAFE_AGE_MS = 24 * 60 * 60 * 1000;

export type TaskImageBudgetDecision = {
  grantsBlocked: boolean;
  warning: boolean;
  refreshRequired: boolean;
  usageTrusted: boolean;
};

export function evaluateTaskImageBudget({
  pooledPercentage,
  wasBlocked,
  observedAt,
  now,
}: {
  pooledPercentage?: number;
  wasBlocked: boolean;
  observedAt?: number;
  now?: number;
}): TaskImageBudgetDecision {
  const hasSnapshot =
    pooledPercentage !== undefined &&
    Number.isFinite(pooledPercentage) &&
    pooledPercentage >= 0 &&
    observedAt !== undefined;
  const age = hasSnapshot && now !== undefined ? Math.max(0, now - observedAt) : 0;
  const refreshRequired = !hasSnapshot || (now !== undefined && age >= TASK_IMAGE_USAGE_REFRESH_INTERVAL_MS);
  const usageTrusted = hasSnapshot && (now === undefined || age <= TASK_IMAGE_USAGE_MAX_SAFE_AGE_MS);
  const warning = hasSnapshot && pooledPercentage >= TASK_IMAGE_USAGE_WARNING_PERCENT;

  let thresholdBlocked = true;
  if (hasSnapshot) {
    thresholdBlocked = wasBlocked
      ? pooledPercentage >= TASK_IMAGE_USAGE_RESUME_PERCENT
      : pooledPercentage >= TASK_IMAGE_USAGE_BLOCK_PERCENT;
  }

  return {
    grantsBlocked: !usageTrusted || thresholdBlocked || (wasBlocked && refreshRequired),
    warning,
    refreshRequired,
    usageTrusted,
  };
}
