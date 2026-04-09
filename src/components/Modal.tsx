import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { TRANSITION_FAST, TRANSITION_OVERSHOOT } from "../lib/motion";
import { cn } from "../lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  position?: "center" | "top";
}

const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: (position: "center" | "top") => ({
    opacity: 0,
    scale: 0.95,
    y: position === "top" ? -10 : 8,
  }),
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
  },
  exit: (position: "center" | "top") => ({
    opacity: 0,
    scale: 0.98,
    y: position === "top" ? -10 : 8,
  }),
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  position = "center",
}: ModalProps) {
  if (!isOpen) return null;

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
        transition={TRANSITION_FAST}
        className={cn(
          "fixed inset-0 z-50 flex",
          "bg-black/60 backdrop-blur-sm",
          position === "center" ? "items-center justify-center" : "items-start justify-center pt-24"
        )}
        onClick={handleBackdropClick}
      >
        <motion.div
          custom={position}
          initial="hidden"
          animate="visible"
          exit="exit"
          variants={modalVariants}
          transition={TRANSITION_OVERSHOOT}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={cn(
            "bg-zinc-900 rounded-2xl",
            "border border-zinc-800/80",
            "shadow-2xl shadow-black/50",
            "w-full max-w-md p-6 mx-4",
            "md:mx-0",
            className
          )}
        >
          {title && (
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-base font-medium text-zinc-100">{title}</h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className={cn(
                  "p-1.5 rounded-lg",
                  "text-zinc-500 hover:text-zinc-300",
                  "hover:bg-zinc-800/60",
                  "transition-colors duration-150"
                )}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
