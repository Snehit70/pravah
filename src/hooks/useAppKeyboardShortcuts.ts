import { useEffect } from "react";

interface UseAppKeyboardShortcutsOptions {
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  closeTaskPopup: () => void;
}

export function useAppKeyboardShortcuts({
  openQuickAdd,
  closeQuickAdd,
  closeTaskPopup,
}: UseAppKeyboardShortcutsOptions) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "n") {
        event.preventDefault();
        openQuickAdd();
      }

      if (event.key === "Escape") {
        closeQuickAdd();
        closeTaskPopup();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openQuickAdd, closeQuickAdd, closeTaskPopup]);
}
