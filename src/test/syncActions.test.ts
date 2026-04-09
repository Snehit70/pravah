import { describe, expect, it } from "vitest";
import {
  buildExternalId,
  shouldRetryCalendarWithoutUpdatedMin,
} from "../../convex/syncActions";

describe("syncActions helpers", () => {
  it("retries without updatedMin when google returns updatedMinTooLongAgo", () => {
    const body = JSON.stringify({
      error: {
        code: 410,
        errors: [
          {
            domain: "calendar",
            reason: "updatedMinTooLongAgo",
            message: "The requested minimum modification time lies too far in the past.",
          },
        ],
      },
    });

    expect(shouldRetryCalendarWithoutUpdatedMin(410, body)).toBe(true);
  });

  it("does not retry for other statuses or reasons", () => {
    const otherReason = JSON.stringify({
      error: {
        code: 410,
        errors: [{ reason: "notFound" }],
      },
    });

    expect(shouldRetryCalendarWithoutUpdatedMin(403, otherReason)).toBe(false);
    expect(shouldRetryCalendarWithoutUpdatedMin(410, otherReason)).toBe(false);
    expect(shouldRetryCalendarWithoutUpdatedMin(410, "not-json")).toBe(false);
  });

  it("keeps primary calendar IDs backward compatible and namespaces others", () => {
    expect(buildExternalId("primary", "abc123")).toBe("abc123");
    expect(buildExternalId("team-calendar@group.calendar.google.com", "abc123")).toBe(
      "team-calendar@group.calendar.google.com:abc123"
    );
  });
});
