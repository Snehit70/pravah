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
  getGoogleOAuthUrl,
  parseGoogleTokens,
  exchangeGoogleAuthCode,
  fetchGmailMessages,
} from "../lib/google/api";
import { cn } from "../lib/utils";
import { Button } from "./Button";
import { useToast } from "./useToast";

interface SettingsProps {
  onClose: () => void;
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

export function Settings({ onClose }: SettingsProps) {
  const [googleConnected, setGoogleConnected] = useState(() => {
    const storedTokens = getGoogleTokens();
    return !!storedTokens && !storedTokens.expired;
  });
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [activeReviewActionId, setActiveReviewActionId] = useState<string | null>(null);
  const upsertIntegration = useMutation(api.sync.upsertIntegration);
  const enqueueGmailCandidate = useMutation(api.sync.enqueueGmailCandidate);
  const approveReviewItem = useMutation(api.sync.approveReviewItem);
  const rejectReviewItem = useMutation(api.sync.rejectReviewItem);
  const importGoogleCalendar = useAction(api.syncActions.importGoogleCalendarAction);
  const pendingReviewItems = useQuery(api.sync.listReviewQueue, {
    status: "pending",
    limit: 25,
  });
  const { showError, showSuccess } = useToast();

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

        if (!cancelled) {
          setGoogleConnected(true);
          showSuccess("Google connected successfully!");
        }
      } catch (err) {
        console.error("Google OAuth callback failed", err);
        if (!cancelled) {
          showError("Failed to complete Google sign-in.");
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
  }, [showError, showSuccess]);

  const handleGoogleConnect = async () => {
    const oauthUrl = await getGoogleOAuthUrl();
    window.location.href = oauthUrl;
  };

  const handleGoogleDisconnect = async () => {
    clearGoogleTokens();
    try {
      await upsertIntegration({
        provider: "google_calendar",
        status: "disconnected",
        syncEnabled: false,
      });
    } catch (error) {
      console.error("Failed to persist Google disconnect state", error);
      showError("Disconnected locally, but failed to update server state.");
    }
    setGoogleConnected(false);
    setCalendarEnabled(false);
    setGmailEnabled(false);
  };

  const handleSync = async () => {
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
        await importGoogleCalendar({ accessToken: tokens.accessToken });
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
      showError("Failed to sync with Google. Please try again.");
    }
    setSyncing(false);
  };

  const handleApproveReviewItem = async (reviewId: Id<"reviewQueue">) => {
    setActiveReviewActionId(reviewId);
    try {
      await approveReviewItem({ reviewId });
      showSuccess("Approved and added to tasks");
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
                        {googleConnected ? "Connected" : "Not connected"}
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
                            onClick={() => setCalendarEnabled(!calendarEnabled)}
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
                            onClick={() => setGmailEnabled(!gmailEnabled)}
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
                            <Button
                              onClick={handleSync}
                              disabled={syncing}
                              variant="secondary"
                              className="w-full flex items-center justify-center gap-2"
                            >
                              <RefreshCw
                                size={16}
                                className={syncing ? "animate-spin" : ""}
                              />
                              {syncing ? "Syncing..." : "Sync Now"}
                            </Button>
                          </motion.div>
                        )}
                      </AnimatePresence>

                      <div className="border-t border-zinc-700/50 pt-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs uppercase tracking-[0.08em] text-zinc-500">
                            Review Queue
                          </p>
                          <span className="text-xs text-zinc-400">
                            {(pendingReviewItems ?? []).length} pending
                          </span>
                        </div>

                        {(pendingReviewItems ?? []).length === 0 ? (
                          <p className="text-xs text-zinc-600">
                            No pending approvals
                          </p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {(pendingReviewItems ?? []).map((item) => (
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
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            <section>
              <h3 className={cn(
                "text-[11px] font-medium uppercase tracking-[0.08em] mb-3",
                "text-zinc-500"
              )}>
                About
              </h3>
              <div className={cn(
                "rounded-xl p-4",
                "bg-zinc-800/60",
                "border border-zinc-700/50"
              )}>
                <p className="text-zinc-100 font-medium">Pravah</p>
                <p className="text-xs text-zinc-500 mt-1">
                  A timeline-first task manager
                </p>
                <p className="text-xs text-zinc-600 mt-2">Version 0.1.0</p>
              </div>
            </section>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
