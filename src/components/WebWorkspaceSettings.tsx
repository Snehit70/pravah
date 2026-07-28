import { useEffect, useState } from "react";
import { Bell, Download, ExternalLink, Gauge, Moon, VolumeX } from "lucide-react";
import type { Task } from "../types";

const REDUCED_MOTION_KEY = "pravah:web-reduced-motion";
const NOTIFICATIONS_KEY = "pravah:web-notifications";

function readStoredBoolean(key: string): boolean {
  return typeof window !== "undefined" && window.localStorage.getItem(key) === "1";
}

export function WebWorkspaceSettings({ tasks }: { tasks: Task[] }) {
  const [reducedMotion, setReducedMotion] = useState(() => readStoredBoolean(REDUCED_MOTION_KEY));
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => readStoredBoolean(NOTIFICATIONS_KEY));
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(() => (
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  ));

  useEffect(() => {
    document.documentElement.dataset.reducedMotion = reducedMotion ? "1" : "0";
    localStorage.setItem(REDUCED_MOTION_KEY, reducedMotion ? "1" : "0");
  }, [reducedMotion]);

  const requestNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === "granted") {
      setNotificationsEnabled(true);
      localStorage.setItem(NOTIFICATIONS_KEY, "1");
    }
  };

  const sendTestNotification = () => {
    if (notificationPermission !== "granted" || !notificationsEnabled) return;
    new Notification("Pravah reminders are ready", {
      body: "Browser notifications are connected to this workspace.",
    });
  };

  const exportTasks = () => {
    const payload = JSON.stringify(
      { exportedAt: new Date().toISOString(), tasks },
      null,
      2
    );
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `pravah-tasks-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          <Gauge size={14} /> Workspace
        </h3>
        <div className="space-y-3 rounded-[4px] border border-white/[0.07] bg-white/[0.03] p-4">
          <label className="flex cursor-pointer items-center justify-between gap-4">
            <span className="flex items-center gap-3">
              <VolumeX size={17} className="text-zinc-400" />
              <span>
                <span className="block text-sm text-zinc-100">Reduced motion</span>
                <span className="block text-xs text-zinc-500">Keep transitions calm on this browser.</span>
              </span>
            </span>
            <input
              type="checkbox"
              checked={reducedMotion}
              onChange={(event) => setReducedMotion(event.target.checked)}
              aria-label="Reduced motion"
              className="h-4 w-4 accent-[oklch(0.78_0.14_260)]"
            />
          </label>
          <div className="flex items-start gap-3 border-t border-white/[0.06] pt-3">
            <Moon size={17} className="mt-0.5 text-zinc-400" />
            <div>
              <p className="text-sm text-zinc-100">Appearance</p>
              <p className="text-xs leading-5 text-zinc-500">The web client uses its dark desktop baseline; system theme switching is intentionally not exposed until the full surface supports it.</p>
            </div>
          </div>
        </div>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          <Bell size={14} /> Browser Reminders
        </h3>
        <div className="space-y-3 rounded-[4px] border border-white/[0.07] bg-white/[0.03] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-100">Notification permission</p>
              <p className="mt-1 text-xs text-zinc-500">
                {notificationPermission === "unsupported"
                  ? "This browser does not support notifications."
                  : notificationPermission === "granted"
                    ? "Allowed for this browser."
                    : notificationPermission === "denied"
                      ? "Blocked by the browser. Change it in site permissions."
                      : "Permission is requested only when you choose it."}
              </p>
            </div>
            {notificationPermission !== "granted" && notificationPermission !== "unsupported" && (
              <button type="button" onClick={() => void requestNotifications()} className="rounded-[4px] border border-white/[0.1] px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]">
                Allow
              </button>
            )}
          </div>
          {notificationPermission === "granted" && (
            <div className="flex items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
              <label className="flex items-center gap-2 text-xs text-zinc-300">
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(event) => {
                    setNotificationsEnabled(event.target.checked);
                    localStorage.setItem(NOTIFICATIONS_KEY, event.target.checked ? "1" : "0");
                  }}
                  aria-label="Enable browser reminders"
                  className="h-4 w-4 accent-[oklch(0.78_0.14_260)]"
                />
                Enable browser reminders
              </label>
              <button type="button" onClick={sendTestNotification} disabled={!notificationsEnabled} className="rounded-[4px] border border-white/[0.1] px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06] disabled:opacity-40">
                Send test
              </button>
            </div>
          )}
        </div>
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-zinc-500">
          <Download size={14} /> Your Data
        </h3>
        <div className="space-y-3 rounded-[4px] border border-white/[0.07] bg-white/[0.03] p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-zinc-100">Export tasks</p>
              <p className="mt-1 text-xs text-zinc-500">Download the current workspace as portable JSON.</p>
            </div>
            <button type="button" onClick={exportTasks} className="inline-flex items-center gap-2 rounded-[4px] border border-white/[0.1] px-2.5 py-1.5 text-xs text-zinc-300 hover:bg-white/[0.06]"><Download size={13} /> Export</button>
          </div>
          <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3 text-xs text-zinc-600">
            <ExternalLink size={12} />
            <a href="https://github.com/Snehit70/pravah/issues" target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-100">Report an issue</a>
          </div>
        </div>
      </section>
    </>
  );
}
