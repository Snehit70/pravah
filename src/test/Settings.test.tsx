/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { Settings } from "../components/Settings";

const upsertIntegrationMock = vi.fn();
const enqueueGmailCandidateMock = vi.fn();
const approveReviewItemMock = vi.fn();
const rejectReviewItemMock = vi.fn();
const importGoogleCalendarMock = vi.fn();
const showErrorMock = vi.fn();
const showSuccessMock = vi.fn();

const pendingReviewItem = {
  _id: "review_1",
  title: "Follow up with design team",
  description: "Please confirm launch timeline",
  deadline: "2026-04-12",
  estimatedMinutes: 30,
  payloadJson: JSON.stringify({ from: "pm@example.com", threadId: "thread-1" }),
};

let mutationIndex = 0;

vi.mock("framer-motion", () => ({
  AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, ...props }: HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    button: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
      <button {...props}>{children}</button>
    ),
  },
}));

vi.mock("convex/react", () => ({
  useMutation: () => {
    const mutationFns = [
      upsertIntegrationMock,
      enqueueGmailCandidateMock,
      approveReviewItemMock,
      rejectReviewItemMock,
    ];
    const selected = mutationFns[mutationIndex % mutationFns.length];
    mutationIndex += 1;
    return selected;
  },
  useAction: () => importGoogleCalendarMock,
  useQuery: (_query: unknown, args: unknown) => {
    if (args && typeof args === "object" && "provider" in args) {
      const provider = (args as { provider: string }).provider;
      if (provider === "google_calendar") {
        return {
          integration: {
            accountEmail: "user@example.com",
            syncEnabled: true,
          },
        };
      }
      if (provider === "gmail") {
        return {
          integration: {
            syncEnabled: true,
          },
        };
      }
    }

    if (args && typeof args === "object" && "status" in args) {
      return [pendingReviewItem];
    }

    return undefined;
  },
}));

vi.mock("../lib/google/api", () => ({
  getGoogleTokens: () => ({ accessToken: "token", expiresIn: 3600, expired: false }),
  saveGoogleTokens: vi.fn(),
  clearGoogleTokens: vi.fn(),
  fetchGoogleAccountEmail: vi.fn(),
  getGoogleAuthErrorMessage: vi.fn((error: unknown, fallback: string) => {
    if (typeof error === "string") return error;
    return fallback;
  }),
  getGoogleOAuthUrl: vi.fn(async () => "https://example.com/oauth"),
  parseGoogleTokens: vi.fn(() => null),
  exchangeGoogleAuthCode: vi.fn(),
  fetchGmailMessages: vi.fn(async () => []),
}));

vi.mock("../components/useToast", () => ({
  useToast: () => ({
    showError: showErrorMock,
    showSuccess: showSuccessMock,
  }),
}));

describe("Settings", () => {
  beforeEach(() => {
    mutationIndex = 0;
    upsertIntegrationMock.mockReset();
    upsertIntegrationMock.mockResolvedValue(undefined);
    enqueueGmailCandidateMock.mockReset();
    enqueueGmailCandidateMock.mockResolvedValue({ deduplicated: false });
    approveReviewItemMock.mockReset();
    approveReviewItemMock.mockResolvedValue({ taskId: "task_1" });
    rejectReviewItemMock.mockReset();
    rejectReviewItemMock.mockResolvedValue(undefined);
    importGoogleCalendarMock.mockReset();
    importGoogleCalendarMock.mockResolvedValue(undefined);
    showErrorMock.mockReset();
    showSuccessMock.mockReset();
  });

  it("shows explicit review queue guidance and no About section", () => {
    render(<Settings onClose={vi.fn()} />);

    expect(screen.getByText("Your Task Review Queue")).toBeInTheDocument();
    expect(
      screen.getByText(/Gmail suggestions wait here for your approval/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Detected deadlines are shown below each item/i)
    ).toBeInTheDocument();
    expect(screen.getByText("Detected deadline: 2026-04-12")).toBeInTheDocument();
    expect(screen.getByText("From: pm@example.com")).toBeInTheDocument();
    expect(screen.queryByText(/about/i)).not.toBeInTheDocument();
  });

  it("passes optional schedule date when approving a review item", async () => {
    render(<Settings onClose={vi.fn()} />);

    const scheduleInput = screen.getByLabelText(/Schedule date on approve/i);
    fireEvent.change(scheduleInput, { target: { value: "2026-04-10" } });

    fireEvent.click(screen.getByRole("button", { name: "Approve" }));

    await waitFor(() => {
      expect(approveReviewItemMock).toHaveBeenCalledWith({
        reviewId: "review_1",
        scheduledDate: "2026-04-10",
      });
    });
  });

  it("preserves accountEmail when persisting calendar toggle state", async () => {
    render(<Settings onClose={vi.fn()} />);

    const calendarLabel = screen.getByText("Google Calendar").closest("label");
    const calendarToggle = calendarLabel?.querySelector("button");
    expect(calendarToggle).toBeTruthy();

    fireEvent.click(calendarToggle!);

    await waitFor(() => {
      expect(upsertIntegrationMock).toHaveBeenCalledWith({
        provider: "google_calendar",
        status: "connected",
        syncEnabled: false,
        accountEmail: "user@example.com",
      });
    });
  });
});
