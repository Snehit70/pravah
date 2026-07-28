import { useEffect, useRef } from "react";
import type { Task } from "../types";

const ENABLED_KEY = "pravah:web-notifications";
const SENT_PREFIX = "pravah:web-reminder-sent:";

/**
 * Lightweight browser reminder support for timed tasks. The tab must remain
 * open because the web client has no service worker scheduler yet; this hook
 * intentionally makes that boundary explicit instead of pretending to offer
 * mobile-style background delivery.
 */
export function useWebReminders(tasks: Task[]) {
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    const check = () => {
      if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
      if (localStorage.getItem(ENABLED_KEY) !== "1") return;
      const now = Date.now();
      for (const task of tasksRef.current) {
        if (!task.deadline || !task.time || task.completedAt || task.cancelledAt) continue;
        const dueAt = new Date(`${task.deadline}T${task.time}:00`).getTime();
        const delta = dueAt - now;
        if (delta < 0 || delta > 5 * 60 * 1000) continue;
        const sentKey = `${SENT_PREFIX}${task._id}:${task.deadline}:${task.time}`;
        if (localStorage.getItem(sentKey) === "1") continue;
        localStorage.setItem(sentKey, "1");
        new Notification(`Upcoming: ${task.title}`, {
          body: `${task.deadline} at ${task.time}`,
          tag: `pravah-task-${task._id}`,
        });
      }
    };
    check();
    const interval = window.setInterval(check, 30_000);
    return () => window.clearInterval(interval);
  }, []);
}
