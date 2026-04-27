import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { T_BASE, T_EXIT_BASE, T_EXIT_FAST, T_FAST } from "../lib/motion";
import { cn } from "../lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  position?: "center" | "top";
  viewTransitionName?: string;
}

// Detect once; SSR-safe.
const VT_SUPPORTED =
  typeof document !== "undefined" &&
  typeof (document as Document & { startViewTransition?: unknown }).startViewTransition === "function";

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  position = "center",
  viewTransitionName,
}: ModalProps) {
  const reduce = useReducedMotion();
  const enter = reduce ? { duration: 0 } : T_FAST;
  const exitFast = reduce ? { duration: 0 } : T_EXIT_FAST;
  const panelEnter = reduce ? { duration: 0 } : T_BASE;
  const panelExit = reduce ? { duration: 0 } : T_EXIT_BASE;

  // When a view-transition name is given AND the browser supports it, the
  // browser drives the enter morph. Skip Framer's enter so the two don't
  // double-animate the same element. Exit still uses Framer because the
  // outgoing snapshot is already in flight when AnimatePresence runs the
  // exit variant on the next paint.
  const browserOwnsEnter = !!viewTransitionName && VT_SUPPORTED && !reduce;

  const overlayVariants = {
    hidden: { opacity: 0, transition: exitFast },
    visible: { opacity: 1, transition: enter },
  };

  const panelVariants = {
    hidden: browserOwnsEnter
      ? { opacity: 1, scale: 1, y: 0, transition: { duration: 0 } }
      : {
          opacity: 0,
          scale: 0.98,
          y: position === "top" ? -10 : 8,
          transition: panelExit,
        },
    visible: { opacity: 1, scale: 1, y: 0, transition: panelEnter },
    exit: {
      opacity: 0,
      scale: 0.985,
      y: position === "top" ? -8 : 6,
      transition: panelExit,
    },
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial="hidden"
          animate="visible"
          exit="hidden"
          variants={overlayVariants}
          className={cn(
            "fixed inset-0 z-50 flex",
            "bg-black/55 backdrop-blur-[2px]",
            position === "center" ? "items-center justify-center" : "items-start justify-center pt-24"
          )}
          onClick={handleBackdropClick}
        >
          <motion.div
            initial="hidden"
            animate="visible"
            exit="exit"
            variants={panelVariants}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{
              transformOrigin: "center",
              // Skip willChange when the browser owns the morph — avoids
              // promoting a layer that the view-transition snapshot already
              // duplicates.
              willChange: browserOwnsEnter ? undefined : "transform, opacity",
              viewTransitionName,
            } as React.CSSProperties}
            className={cn(
              "bg-[#252525] rounded-2xl",
              "border border-white/10",
              "shadow-xl shadow-black/40",
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
                    "text-zinc-400 hover:text-zinc-100",
                    "hover:bg-zinc-800"
                  )}
                  style={{ transition: "color var(--dur-instant) var(--ease-out-expo), background-color var(--dur-instant) var(--ease-out-expo)" }}
                >
                  <X size={18} />
                </button>
              </div>
            )}
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
