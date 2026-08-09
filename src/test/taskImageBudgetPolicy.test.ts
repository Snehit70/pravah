import { describe, expect, it } from "vitest";
import {
  TASK_IMAGE_USAGE_MAX_SAFE_AGE_MS,
  TASK_IMAGE_USAGE_REFRESH_INTERVAL_MS,
  evaluateTaskImageBudget,
} from "../../convex/taskImageBudget";

const HOUR_MS = 60 * 60 * 1000;

describe("Task-image provider budget policy", () => {
  it("warns at 70%, blocks at 85%, and resumes only below 75%", () => {
    expect(evaluateTaskImageBudget({ pooledPercentage: 69.9, wasBlocked: false, observedAt: 1, now: 1 })).toMatchObject({
      grantsBlocked: false,
      warning: false,
    });
    expect(evaluateTaskImageBudget({ pooledPercentage: 70, wasBlocked: false, observedAt: 1, now: 1 })).toMatchObject({
      grantsBlocked: false,
      warning: true,
    });
    expect(evaluateTaskImageBudget({ pooledPercentage: 85, wasBlocked: false, observedAt: 1, now: 1 })).toMatchObject({
      grantsBlocked: true,
      warning: true,
    });
    expect(evaluateTaskImageBudget({ pooledPercentage: 75, wasBlocked: true, observedAt: 1, now: 1 })).toMatchObject({
      grantsBlocked: true,
      warning: true,
    });
    expect(evaluateTaskImageBudget({ pooledPercentage: 74.9, wasBlocked: true, observedAt: 1, now: 1 })).toMatchObject({
      grantsBlocked: false,
      warning: true,
    });
  });

  it("requires a refresh after six hours and eventually distrusts stale usage", () => {
    const observedAt = 1_000;

    expect(
      evaluateTaskImageBudget({
        pooledPercentage: 20,
        wasBlocked: false,
        observedAt,
        now: observedAt + TASK_IMAGE_USAGE_REFRESH_INTERVAL_MS - 1,
      })
    ).toMatchObject({ grantsBlocked: false, refreshRequired: false, usageTrusted: true });
    expect(
      evaluateTaskImageBudget({
        pooledPercentage: 20,
        wasBlocked: false,
        observedAt,
        now: observedAt + 6 * HOUR_MS,
      })
    ).toMatchObject({ grantsBlocked: false, refreshRequired: true, usageTrusted: true });
    expect(
      evaluateTaskImageBudget({
        pooledPercentage: 20,
        wasBlocked: false,
        observedAt,
        now: observedAt + TASK_IMAGE_USAGE_MAX_SAFE_AGE_MS + 1,
      })
    ).toMatchObject({ grantsBlocked: true, refreshRequired: true, usageTrusted: false });
  });

  it("fails closed without usage and never resumes a blocked gate from stale data", () => {
    expect(evaluateTaskImageBudget({ wasBlocked: false, now: 10_000 })).toMatchObject({
      grantsBlocked: true,
      refreshRequired: true,
      usageTrusted: false,
    });
    expect(
      evaluateTaskImageBudget({
        pooledPercentage: 20,
        wasBlocked: true,
        observedAt: 1_000,
        now: 1_000 + TASK_IMAGE_USAGE_REFRESH_INTERVAL_MS,
      })
    ).toMatchObject({ grantsBlocked: true, refreshRequired: true, usageTrusted: true });
  });
});
