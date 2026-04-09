import { useState, useEffect } from "react";
import { X, Calendar, Mail, CheckCircle, XCircle, RefreshCw, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  getGoogleTokens,
  saveGoogleTokens,
  clearGoogleTokens,
  fetchGoogleAccountEmail,
  fetchGoogleCalendars,
  getGoogleAuthErrorMessage,
  getGoogleOAuthUrl,
  parseGoogleTokens,
  exchangeGoogleAuthCode,
  fetchGmailMessages,
} from "../lib/google/api";
import type { GoogleCalendarListEntry } from "../lib/google/types";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import { useToast } from "./useToast";

interface SettingsProps {
  onClose: () => void;
}

interface ReviewPayloadPreview {
  from?: string;
  date?: string;
  threadId?: string;
}

function parseReviewPayload(payloadJson?: string): ReviewPayloadPreview | null {
  if (!payloadJson) return null;
  try {
    const parsed = JSON.parse(payloadJson) as Record<string, unknown>;
    return {
      from: typeof parsed.from === "string" ? parsed.from : undefined,
      date: typeof parsed.date === "string" ? parsed.date : undefined,
      threadId: typeof parsed.threadId === "string" ? parsed.threadId : undefined,
    };
  } catch {
    return null;
  }
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.95, y: -10 },
  visible: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: -10 },
};

const CALENDAR_SELECTION_STORAGE_KEY = "pravah_google_calendar_selection";

export function Settings({ onClose }: SettingsProps) {
  const [googleConnected, setGoogleConnected] = useState(() => {
    const storedTokens = getGoogleTokens();
    return !!storedTokens && !storedTokens.expired;
  });
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [reviewScheduleOverrides, setReviewScheduleOverrides] = useState<Record<string, string>>(
    {}
  );
  const [attemptedEmailHydration, setAttemptedEmailHydration] = useState(false);
  const [hydratedToggleState, setHydratedToggleState] = useState(false);
  const [availableCalendars, setAvailableCalendars] = useState<GoogleCalendarListEntry[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeReviewActionId, setActiveReviewActionId] = useState<string | null>(null);
  const upsertIntegration = useMutation(api.sync.upsertIntegration);
  const enqueueGmailCandidate = useMutation(api.sync.enqueueGmailCandidate);
  const approveReviewItem = useMutation(api.sync.approveReviewItem);
  const rejectReviewItem = useMutation(api.sync.rejectReviewItem);
  const importGoogleCalendar = useAction(api.syncActions.importGoogleCalendarAction);
  const calendarIntegrationStatus = useQuery(api.sync.getIntegrationStatus, {
    provider: "google_calendar",
  });
  const gmailIntegrationStatus = useQuery(api.sync.getIntegrationStatus, {
    provider: "gmail",
  });
  const shouldLoadReviewQueue = googleConnected && gmailEnabled;
  const pendingReviewItems = useQuery(
    api.sync.listReviewQueue,
    shouldLoadReviewQueue
      ? ({
          status: "pending",
          limit: 25,
        } as const)
      : "skip"
  );
  const safePendingReviewItems = shouldLoadReviewQueue ? (pendingReviewItems ?? []) : [];
  const googleAccountEmail = calendarIntegrationStatus?.integration?.accountEmail;
  const { showError, showSuccess } = useToast();

  const getSyncErrorMessage = (error: unknown): string => {
    const raw = getGoogleAuthErrorMessage(error, "Failed to sync with Google. Please try again.");
    if (raw.includes("SERVICE_DISABLED") || raw.includes("accessNotConfigured")) {
      return "Google Calendar API is disabled in your Google Cloud project. Enable it, wait a few minutes, then retry sync.";
    }
    if (raw.includes("insufficientPermissions")) {
      return "Google permissions are insufficient. Reconnect Google and grant Calendar access.";
    }
    return raw;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;

    const handleOAuthCallback = async () => {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        showError("Google sign-in was cancelled or failed.");
        return;
      }

      if (!code) {
        return;
      }

      try {
        const tokens = await exchangeGoogleAuthCode(code);
        saveGoogleTokens(tokens.accessToken, tokens.expiresIn);
        let accountEmail: string | undefined;
        try {
          accountEmail = await fetchGoogleAccountEmail(tokens.accessToken);
        } catch (profileError) {
          console.warn("Unable to load Google account email", profileError);
        }
        await upsertIntegration({
          provider: "google_calendar",
          status: "connected",
          syncEnabled: calendarEnabled,
          accountEmail,
          tokenExpiresAt: Date.now() + tokens.expiresIn * 1000,
        });

        if (!cancelled) {
          setGoogleConnected(true);
          showSuccess("Google connected successfully!");
        }
      } catch (err) {
        console.error("Google OAuth callback failed", err);
        if (!cancelled) {
          showError(getGoogleAuthErrorMessage(err, "Failed to complete Google sign-in."));
        }
      } finally {
        url.searchParams.delete("code");
        url.searchParams.delete("scope");
        url.searchParams.delete("authuser");
        url.searchParams.delete("prompt");
        url.searchParams.delete("error");
        window.history.replaceState({}, "", url.toString());
      }
    };

    const hash = window.location.hash;
    if (hash.startsWith("#")) {
      const parsedTokens = parseGoogleTokens(hash);
      if (parsedTokens) {
        saveGoogleTokens(parsedTokens.accessToken, parsedTokens.expiresIn);
        window.location.hash = "";
        window.setTimeout(() => {
          setGoogleConnected(true);
        }, 0);
      }
    }

    void handleOAuthCallback();

    return () => {
      cancelled = true;
    };
  }, [showError, showSuccess, upsertIntegration, calendarEnabled]);

  useEffect(() => {
    if (hydratedToggleState) return;
    if (!calendarIntegrationStatus || !gmailIntegrationStatus) return;

    setCalendarEnabled(Boolean(calendarIntegrationStatus.integration?.syncEnabled));
    setGmailEnabled(Boolean(gmailIntegrationStatus.integration?.syncEnabled));
    setHydratedToggleState(true);
  }, [hydratedToggleState, calendarIntegrationStatus, gmailIntegrationStatus]);

  useEffect(() => {
    if (!calendarIntegrationStatus) return;
    if (!googleConnected || googleAccountEmail || attemptedEmailHydration) return;
    const tokens = getGoogleTokens();
    if (!tokens || tokens.expired) return;

    setAttemptedEmailHydration(true);
    void (async () => {
      try {
        const accountEmail = await fetchGoogleAccountEmail(tokens.accessToken);
        await upsertIntegration({
          provider: "google_calendar",
          status: "connected",
          syncEnabled: Boolean(calendarIntegrationStatus.integration?.syncEnabled),
          accountEmail,
        });
      } catch (error) {
        console.warn("Unable to hydrate Google account email", error);
      }
    })();
  }, [
    googleConnected,
    googleAccountEmail,
    attemptedEmailHydration,
    upsertIntegration,
    calendarIntegrationStatus,
  ]);

  useEffect(() => {
    if (!googleConnected) {
      setAvailableCalendars([]);
      setSelectedCalendarIds([]);
      return;
    }

    const tokens = getGoogleTokens();
    if (!tokens || tokens.expired) return;

    let cancelled = false;
    setLoadingCalendars(true);
    void (async () => {
      try {
        const calendars = await fetchGoogleCalendars(tokens.accessToken);
        if (cancelled) return;
        setAvailableCalendars(calendars);

        const storedRaw = localStorage.getItem(CALENDAR_SELECTION_STORAGE_KEY);
        const storedIds = storedRaw ? (JSON.parse(storedRaw) as string[]) : [];
        const calendarIds = calendars.map((calendar) => calendar.id);
        const nextSelection =
          storedIds.length > 0
            ? storedIds.filter((id) => calendarIds.includes(id))
            : calendarIds;
        setSelectedCalendarIds(nextSelection);
      } catch (error) {
        console.warn("Failed to fetch Google calendar list", error);
        if (!cancelled) {
          setAvailableCalendars([{ id: "primary", summary: "Primary", primary: true }]);
          setSelectedCalendarIds(["primary"]);
        }
      } finally {
        if (!cancelled) {
          setLoadingCalendars(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [googleConnected]);

  useEffect(() => {
    if (selectedCalendarIds.length === 0) {
      localStorage.removeItem(CALENDAR_SELECTION_STORAGE_KEY);
      return;
    }
    localStorage.setItem(CALENDAR_SELECTION_STORAGE_KEY, JSON.stringify(selectedCalendarIds));
  }, [selectedCalendarIds]);

  const persistIntegrationToggle = async (
    provider: "google_calendar" | "gmail",
    syncEnabled: boolean
  ) => {
    const payload: {
      provider: "google_calendar" | "gmail";
      status: "connected" | "disconnected";
      syncEnabled: boolean;
      accountEmail?: string;
    } = {
      provider,
      status: googleConnected ? "connected" : "disconnected",
      syncEnabled,
    };

    // Preserve the known Google account identity while updating toggle state.
    if (googleAccountEmail) {
      payload.accountEmail = googleAccountEmail;
    }

    await upsertIntegration(payload);
  };

  const handleCalendarToggle = async () => {
    const next = !calendarEnabled;
    setCalendarEnabled(next);
    try {
      await persistIntegrationToggle("google_calendar", next);
    } catch (error) {
      console.error("Failed to persist calendar toggle", error);
      setCalendarEnabled(!next);
      showError("Failed to save Google Calendar toggle.");
    }
  };

  const handleGmailToggle = async () => {
    const next = !gmailEnabled;
    setGmailEnabled(next);
    try {
      await persistIntegrationToggle("gmail", next);
    } catch (error) {
      console.error("Failed to persist Gmail toggle", error);
      setGmailEnabled(!next);
      showError("Failed to save Gmail toggle.");
    }
  };

  const handleGoogleConnect = async () => {
    try {
      const oauthUrl = await getGoogleOAuthUrl();
      window.location.href = oauthUrl;
    } catch (error) {
      showError(getGoogleAuthErrorMessage(error, "Failed to start Google sign-in."));
    }
  };

  const handleGoogleDisconnect = async () => {
    clearGoogleTokens();
    try {
      await Promise.all([
        upsertIntegration({
          provider: "google_calendar",
          status: "disconnected",
          syncEnabled: false,
          accountEmail: undefined,
        }),
        upsertIntegration({
          provider: "gmail",
          status: "disconnected",
          syncEnabled: false,
          accountEmail: undefined,
        }),
      ]);
    } catch (error) {
      console.error("Failed to persist Google disconnect state", error);
      showError("Disconnected locally, but failed to update server state.");
    }
    setGoogleConnected(false);
    setCalendarEnabled(false);
    setGmailEnabled(false);
  };

  const handleSync = async (fullResync = false) => {
    const tokens = getGoogleTokens();
    if (!tokens || tokens.expired) {
      showError("Google authentication expired. Please reconnect.");
      return;
    }

    setSyncing(true);
    try {
      if (calendarEnabled) {
        await upsertIntegration({
          provider: "google_calendar",
          status: "connected",
          syncEnabled: true,
        });
        await importGoogleCalendar({
          accessToken: tokens.accessToken,
          calendarIds: selectedCalendarIds.length > 0 ? selectedCalendarIds : undefined,
          fullResync,
        });
      }
      if (gmailEnabled) {
        const messages = await fetchGmailMessages(tokens.accessToken);
        let queuedCount = 0;
        for (const message of messages) {
          const candidateTitle =
            message.subject?.trim() ||
            message.snippet?.trim() ||
            `Email follow-up ${message.id.slice(0, 8)}`;
          const result = await enqueueGmailCandidate({
            externalId: message.id,
            title: candidateTitle,
            description: message.snippet,
            payloadJson: JSON.stringify({
              threadId: message.threadId,
              from: message.from,
              date: message.date,
            }),
          });
          if (!result.deduplicated) {
            queuedCount += 1;
          }
        }
        if (messages.length > 0) {
          showSuccess(
            queuedCount > 0
              ? `Queued ${queuedCount} Gmail item(s) for approval`
              : "No new Gmail candidates to review"
          );
        }
      }
      showSuccess("Sync completed successfully!");
    } catch (error) {
      console.error("Sync error:", error);
      showError(getSyncErrorMessage(error));
    }
    setSyncing(false);
  };

  const toggleCalendarSelection = (calendarId: string) => {
    setSelectedCalendarIds((prev) =>
      prev.includes(calendarId) ? prev.filter((id) => id !== calendarId) : [...prev, calendarId]
    );
  };

  const handleApproveReviewItem = async (reviewId: Id<"reviewQueue">) => {
    setActiveReviewActionId(reviewId);
    const scheduledDate = reviewScheduleOverrides[reviewId];
    try {
      await approveReviewItem({
        reviewId,
        scheduledDate: scheduledDate || undefined,
      });
      showSuccess("Approved and added to tasks");
      setReviewScheduleOverrides((prev) => {
        const next = { ...prev };
        delete next[reviewId];
        return next;
      });
    } catch (error) {
      console.error("Approve review item failed", error);
      showError("Failed to approve review item");
    } finally {
      setActiveReviewActionId(null);
    }
  };

  const handleRejectReviewItem = async (reviewId: Id<"reviewQueue">) => {
    setActiveReviewActionId(reviewId);
    try {
      await rejectReviewItem({ reviewId });
      showSuccess("Review item rejected");
    } catch (error) {
      console.error("Reject review item failed", error);
      showError("Failed to reject review item");
    } finally {
      setActiveReviewActionId(null);
    }
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={overlayVariants}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          "fixed inset-0 z-50 flex items-start justify-center pt-24",
          "bg-black/60 backdrop-blur-sm"
        )}
        onClick={handleBackdropClick}
      >
        <motion.div
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={modalVariants}
          transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
          className={cn(
            "w-full max-w-lg p-6 mx-4 md:mx-0 max-h-[80vh] overflow-y-auto",
            "bg-zinc-900/95 backdrop-blur-xl rounded-2xl",
            "border border-zinc-700/50",
            "shadow-2xl shadow-black/60"
          )}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-zinc-100">Settings</h2>
            <button
              onClick={onClose}
              aria-label="Close settings"
              className={cn(
                "p-2 rounded-lg",
                "text-zinc-500 hover:text-zinc-300",
                "hover:bg-zinc-800/60",
                "transition-colors duration-150"
              )}
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-6">
            <section>
              <h3 className={cn(
                "text-[11px] font-medium uppercase tracking-[0.08em] mb-3",
                "text-zinc-500 flex items-center gap-2"
              )}>
                <Calendar size={14} />
                Integrations
              </h3>

              <div className={cn(
                "rounded-xl p-4 space-y-4",
                "bg-zinc-800/60",
                "border border-zinc-700/50"
              )}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "p-2 rounded-xl",
                        googleConnected ? "bg-emerald-500/15" : "bg-zinc-800/80"
                      )}
                    >
                      {googleConnected ? (
                        <CheckCircle size={20} className="text-emerald-400" />
                      ) : (
                        <XCircle size={20} className="text-zinc-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-zinc-100 font-medium">Google Account</p>
                      <p className="text-xs text-zinc-500">
                        {googleConnected ? (googleAccountEmail ?? "Connected") : "Not connected"}
                      </p>
                    </div>
                  </div>

                  {googleConnected ? (
                    <Button
                      onClick={handleGoogleDisconnect}
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-400"
                    >
                      Disconnect
                    </Button>
                  ) : (
                    <Button
                      onClick={handleGoogleConnect}
                      variant="primary"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      Connect
                      <ExternalLink size={14} />
                    </Button>
                  )}
                </div>

                <AnimatePresence>
                  {googleConnected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                      className="space-y-4 overflow-hidden"
                    >
                      <div className="border-t border-zinc-700/50 pt-4">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Calendar size={18} className="text-zinc-400" />
                            <div>
                              <p className="text-zinc-100 text-sm">Google Calendar</p>
                              <p className="text-xs text-zinc-500">
                                Sync deadlines with calendar events
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleCalendarToggle}
                            className={cn(
                              "w-11 h-6 rounded-full transition-colors duration-150",
                              calendarEnabled ? "bg-amber-500" : "bg-zinc-700"
                            )}
                          >
                            <motion.div
                              animate={{ x: calendarEnabled ? 22 : 4 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              className="w-4 h-4 bg-white rounded-full shadow-sm"
                            />
                          </button>
                        </label>
                      </div>

                      {calendarEnabled && (
                        <div className="border-t border-zinc-700/50 pt-4 space-y-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs uppercase tracking-[0.08em] text-zinc-500">
                              Calendars To Sync
                            </p>
                            <span className="text-xs text-zinc-400">
                              {selectedCalendarIds.length}/{availableCalendars.length || 1}
                            </span>
                          </div>
                          {loadingCalendars ? (
                            <p className="text-xs text-zinc-500">Loading calendars...</p>
                          ) : (
                            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                              {availableCalendars.map((calendar) => (
                                <label
                                  key={calendar.id}
                                  className="flex items-center gap-2.5 text-xs text-zinc-300 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={selectedCalendarIds.includes(calendar.id)}
                                    onChange={() => toggleCalendarSelection(calendar.id)}
                                    className="accent-amber-500"
                                  />
                                  <span className="truncate">
                                    {calendar.summary}
                                    {calendar.primary ? " (Primary)" : ""}
                                  </span>
                                </label>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <div className="border-t border-zinc-700/50 pt-4">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Mail size={18} className="text-zinc-400" />
                            <div>
                              <p className="text-zinc-100 text-sm">Gmail</p>
                              <p className="text-xs text-zinc-500">
                                Extract tasks from starred emails
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={handleGmailToggle}
                            className={cn(
                              "w-11 h-6 rounded-full transition-colors duration-150",
                              gmailEnabled ? "bg-amber-500" : "bg-zinc-700"
                            )}
                          >
                            <motion.div
                              animate={{ x: gmailEnabled ? 22 : 4 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              className="w-4 h-4 bg-white rounded-full shadow-sm"
                            />
                          </button>
                        </label>
                      </div>

                      <AnimatePresence>
                        {(calendarEnabled || gmailEnabled) && (
                          <motion.div
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                          >
                            <div className="grid grid-cols-2 gap-2">
                              <Button
                                onClick={() => void handleSync(false)}
                                disabled={
                                  syncing || (calendarEnabled && selectedCalendarIds.length === 0)
                                }
                                variant="secondary"
                                className="w-full flex items-center justify-center gap-2"
                              >
                                <RefreshCw
                                  size={16}
                                  className={syncing ? "animate-spin" : ""}
                                />
                                {syncing ? "Syncing..." : "Sync Now"}
                              </Button>
                              <Button
                                onClick={() => void handleSync(true)}
                                disabled={
                                  syncing || (calendarEnabled && selectedCalendarIds.length === 0)
                                }
                                variant="ghost"
                                className="w-full flex items-center justify-center gap-2 text-amber-300 hover:text-amber-200"
                              >
                                Full Resync
                              </Button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="border-t border-zinc-700/50 pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-[0.08em] text-zinc-500">
                            Your Task Review Queue
                          </p>
                          <span className="text-xs text-zinc-400">
                            {safePendingReviewItems.length} pending
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500">
                          Gmail suggestions wait here for your approval. Items become tasks only
                          after you approve.
                        </p>
                        <p className="text-xs text-zinc-500">
                          Detected deadlines are shown below each item. You can optionally choose
                          a schedule date before approving.
                        </p>

                        {safePendingReviewItems.length === 0 ? (
                          <p className="text-xs text-zinc-600">
                            No pending approvals
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {safePendingReviewItems.map((item) => {
                              const reviewPayload = parseReviewPayload(item.payloadJson);
                              return (
                                <div
                                  key={item._id}
                                  className="rounded-lg border border-zinc-700/60 bg-zinc-800/60 p-2.5"
                                >
                                  <p className="text-sm text-zinc-100 leading-snug">{item.title}</p>
                                  {item.description && (
                                    <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                                      {item.description}
                                    </p>
                                  )}
                                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                                    <span
                                      className={cn(
                                        "px-1.5 py-0.5 rounded-full",
                                        item.deadline
                                          ? "bg-yellow-500/20 text-yellow-300"
                                          : "bg-amber-500/20 text-amber-300"
                                      )}
                                    >
                                      {item.deadline ? "Deadline task" : "Open task"}
                                    </span>
                                    <span className="px-1.5 py-0.5 rounded-full bg-zinc-700/60 text-zinc-300">
                                      {item.deadline
                                        ? `Detected deadline: ${item.deadline}`
                                        : "No deadline detected"}
                                    </span>
                                    {item.estimatedMinutes && (
                                      <span className="px-1.5 py-0.5 rounded-full bg-zinc-700/60 text-zinc-300">
                                        {item.estimatedMinutes} min
                                      </span>
                                    )}
                                    {reviewPayload?.from && (
                                      <span className="px-1.5 py-0.5 rounded-full bg-zinc-700/60 text-zinc-300">
                                        From: {reviewPayload.from}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-2">
                                    <label
                                      htmlFor={`schedule-${item._id}`}
                                      className="block text-[10px] uppercase tracking-[0.08em] text-zinc-500 mb-1"
                                    >
                                      Schedule date on approve (optional)
                                    </label>
                                    <input
                                      id={`schedule-${item._id}`}
                                      type="date"
                                      value={reviewScheduleOverrides[item._id] ?? ""}
                                      onChange={(event) =>
                                        setReviewScheduleOverrides((prev) => ({
                                          ...prev,
                                          [item._id]: event.target.value,
                                        }))
                                      }
                                      className={cn(
                                        "w-full px-2 py-1.5 text-xs rounded-lg",
                                        "bg-zinc-900/70 text-zinc-100",
                                        "border border-zinc-700/60",
                                        "focus:outline-none focus:border-amber-500/60"
                                      )}
                                    />
                                  </div>
                                  <div className="flex items-center gap-2 mt-2">
                                    <Button
                                      onClick={() => handleApproveReviewItem(item._id)}
                                      size="sm"
                                      variant="primary"
                                      disabled={activeReviewActionId === item._id}
                                      className="flex-1"
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      onClick={() => handleRejectReviewItem(item._id)}
                                      size="sm"
                                      variant="ghost"
                                      disabled={activeReviewActionId === item._id}
                                      className="flex-1 text-red-400 hover:text-red-400"
                                    >
                                      Reject
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
