import { useState, useEffect } from "react";
import { X, Calendar, Mail, CheckCircle, XCircle, RefreshCw, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getGoogleTokens,
  saveGoogleTokens,
  clearGoogleTokens,
  getGoogleOAuthUrl,
  parseGoogleTokens,
  fetchCalendarEvents,
  fetchGmailMessages,
} from "../lib/google/api";
import { cn } from "../lib/utils";

interface SettingsProps {
  onClose: () => void;
}

export function Settings({ onClose }: SettingsProps) {
  const [googleConnected, setGoogleConnected] = useState(false);
  const [calendarEnabled, setCalendarEnabled] = useState(false);
  const [gmailEnabled, setGmailEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const storedTokens = getGoogleTokens();
    setGoogleConnected(!!storedTokens && !storedTokens.expired);

    const hash = window.location.hash;
    if (hash.startsWith("#")) {
      const parsedTokens = parseGoogleTokens(hash);
      if (parsedTokens) {
        saveGoogleTokens(parsedTokens.accessToken, parsedTokens.expiresIn);
        window.location.hash = "";
        setGoogleConnected(true);
      }
    }
  }, []);

  const handleGoogleConnect = () => {
    window.location.href = getGoogleOAuthUrl();
  };

  const handleGoogleDisconnect = () => {
    clearGoogleTokens();
    setGoogleConnected(false);
    setCalendarEnabled(false);
    setGmailEnabled(false);
  };

  const handleSync = async () => {
    const tokens = getGoogleTokens();
    if (!tokens || tokens.expired) return;

    setSyncing(true);
    try {
      if (calendarEnabled) {
        const events = await fetchCalendarEvents(tokens.accessToken);
        console.log("Calendar events:", events);
      }
      if (gmailEnabled) {
        const messages = await fetchGmailMessages(tokens.accessToken);
        console.log("Gmail messages:", messages);
      }
    } catch (error) {
      console.error("Sync error:", error);
    }
    setSyncing(false);
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm"
        onClick={handleBackdropClick}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: -10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -10 }}
          transition={{ type: "spring", duration: 0.3, bounce: 0.1 }}
          className="bg-zinc-900 border border-zinc-700/50 rounded-2xl w-full max-w-lg p-5 shadow-2xl max-h-[80vh] overflow-y-auto"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-white">Settings</h2>
            <button
              onClick={onClose}
              className="p-2 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-6">
            <section>
              <h3 className="text-sm font-medium text-zinc-400 mb-3 flex items-center gap-2">
                <Calendar size={16} />
                Google Integrations
              </h3>

              <div className="bg-zinc-800/50 rounded-xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "p-2 rounded-lg",
                        googleConnected ? "bg-green-500/20" : "bg-zinc-700"
                      )}
                    >
                      {googleConnected ? (
                        <CheckCircle size={20} className="text-green-400" />
                      ) : (
                        <XCircle size={20} className="text-zinc-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-white font-medium">Google Account</p>
                      <p className="text-xs text-zinc-500">
                        {googleConnected ? "Connected" : "Not connected"}
                      </p>
                    </div>
                  </div>

                  {googleConnected ? (
                    <button
                      onClick={handleGoogleDisconnect}
                      className="text-sm text-red-400 hover:text-red-300 transition-colors"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <motion.button
                      onClick={handleGoogleConnect}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="px-4 py-2 bg-white text-zinc-900 rounded-lg text-sm font-medium hover:bg-zinc-100 flex items-center gap-2 transition-colors"
                    >
                      Connect
                      <ExternalLink size={14} />
                    </motion.button>
                  )}
                </div>

                <AnimatePresence>
                  {googleConnected && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="space-y-4"
                    >
                      <div className="border-t border-zinc-700 pt-4">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Calendar size={18} className="text-zinc-400" />
                            <div>
                              <p className="text-white text-sm">Google Calendar</p>
                              <p className="text-xs text-zinc-500">
                                Sync deadlines with calendar events
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setCalendarEnabled(!calendarEnabled)}
                            className={cn(
                              "w-10 h-6 rounded-full transition-colors",
                              calendarEnabled ? "bg-cyan-500" : "bg-zinc-600"
                            )}
                          >
                            <motion.div
                              animate={{ x: calendarEnabled ? 20 : 4 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              className="w-4 h-4 bg-white rounded-full"
                            />
                          </button>
                        </label>
                      </div>

                      <div className="border-t border-zinc-700 pt-4">
                        <label className="flex items-center justify-between cursor-pointer">
                          <div className="flex items-center gap-3">
                            <Mail size={18} className="text-zinc-400" />
                            <div>
                              <p className="text-white text-sm">Gmail</p>
                              <p className="text-xs text-zinc-500">
                                Extract tasks from starred emails
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => setGmailEnabled(!gmailEnabled)}
                            className={cn(
                              "w-10 h-6 rounded-full transition-colors",
                              gmailEnabled ? "bg-cyan-500" : "bg-zinc-600"
                            )}
                          >
                            <motion.div
                              animate={{ x: gmailEnabled ? 20 : 4 }}
                              transition={{ type: "spring", stiffness: 500, damping: 30 }}
                              className="w-4 h-4 bg-white rounded-full"
                            />
                          </button>
                        </label>
                      </div>

                      <AnimatePresence>
                        {(calendarEnabled || gmailEnabled) && (
                          <motion.button
                            initial={{ opacity: 0, y: -10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            onClick={handleSync}
                            disabled={syncing}
                            whileHover={{ scale: syncing ? 1 : 1.01 }}
                            whileTap={{ scale: syncing ? 1 : 0.99 }}
                            className="w-full py-2.5 bg-zinc-700 text-white rounded-lg text-sm flex items-center justify-center gap-2 hover:bg-zinc-600 disabled:opacity-50 transition-colors"
                          >
                            <RefreshCw
                              size={16}
                              className={syncing ? "animate-spin" : ""}
                            />
                            {syncing ? "Syncing..." : "Sync Now"}
                          </motion.button>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            <section>
              <h3 className="text-sm font-medium text-zinc-400 mb-3">About</h3>
              <div className="bg-zinc-800/50 rounded-xl p-4">
                <p className="text-white font-medium">Pravah</p>
                <p className="text-xs text-zinc-500 mt-1">
                  A horizontal timeline-based task manager
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
