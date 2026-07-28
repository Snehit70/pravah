import { createContext, useContext } from "react";

export type ToastType = "success" | "error" | "info";

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface ToastContextValue {
  showToast: (message: string, type?: ToastType, action?: ToastAction) => void;
  showError: (message: string) => void;
  showSuccess: (message: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}
