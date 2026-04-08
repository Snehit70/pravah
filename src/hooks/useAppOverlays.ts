import { useCallback, useState } from "react";
import type { Task } from "../types";

export function useAppOverlays() {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const openTaskPopup = useCallback((task: Task) => {
    setSelectedTask(task);
  }, []);

  const closeTaskPopup = useCallback(() => {
    setSelectedTask(null);
  }, []);

  const openQuickAdd = useCallback(() => {
    setShowQuickAdd(true);
  }, []);

  const closeQuickAdd = useCallback(() => {
    setShowQuickAdd(false);
  }, []);

  const openSettings = useCallback(() => {
    setShowSettings(true);
  }, []);

  const closeSettings = useCallback(() => {
    setShowSettings(false);
  }, []);

  return {
    selectedTask,
    showQuickAdd,
    showSettings,
    openTaskPopup,
    closeTaskPopup,
    openQuickAdd,
    closeQuickAdd,
    openSettings,
    closeSettings,
  };
}
