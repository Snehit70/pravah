import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, AlertCircle, CheckCircle, Info } from "lucide-react";
import { cn } from "../lib/utils";
import { ToastContext, type ToastType } from "./useToast";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

const toastVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, x: 100, scale: 0.95 },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Math.random().toString(36).substring(7);
    setToasts((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const showError = useCallback((message: string) => {
    showToast(message, "error");
  }, [showToast]);

  const showSuccess = useCallback((message: string) => {
    showToast(message, "success");
  }, [showToast]);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <ToastContext.Provider value={{ showToast, showError, showSuccess }}>
      {children}
      <div
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <AnimatePresence>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const icons = {
    success: <CheckCircle size={18} className="text-emerald-400" />,
    error: <AlertCircle size={18} className="text-red-400" />,
    info: <Info size={18} className="text-blue-400" />,
  };

  const borderColors = {
    success: "#34D399",
    error: "#F87171",
    info: "#0075de",
  };

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      exit="exit"
      variants={toastVariants}
      transition={{ duration: 0.25, ease: [0.34, 1.56, 0.64, 1] }}
      className={cn(
        "flex items-center gap-3 p-4 rounded-xl",
        "bg-zinc-900/95 backdrop-blur-md",
        "border border-white/10",
        "shadow-xl shadow-black/35"
      )}
      style={{
        borderLeftWidth: 3,
        borderLeftColor: borderColors[toast.type],
      }}
    >
      {icons[toast.type]}
      <p className="flex-1 text-sm text-zinc-100">{toast.message}</p>
      <button
        onClick={onClose}
        aria-label="Dismiss notification"
        className={cn(
          "p-1 rounded-lg",
          "text-zinc-400 hover:text-zinc-100",
          "hover:bg-zinc-800",
          "transition-colors duration-150"
        )}
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
