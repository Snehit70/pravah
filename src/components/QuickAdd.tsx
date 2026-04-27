import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "../../convex/_generated/api";
import { T_BASE, T_FAST, tx } from "../lib/motion";
import { getLocalDateString } from "../lib/utils";
import { getTomorrowDateString } from "../lib/quickAddDates";
import { useToast } from "./useToast";

interface QuickAddProps {
  onClose: () => void;
}

const ACCENT = "oklch(0.78 0.14 260)";
const ACCENT_SOFT = "oklch(0.72 0.16 260 / 0.2)";
const DEADLINE_COLOR = "oklch(0.72 0.16 30)";

function Pill({
  label,
  active,
  onClick,
  dot,
  dotColor,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  dot?: boolean;
  dotColor?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        background: active ? ACCENT_SOFT : "rgba(255,255,255,.03)",
        border: `1px solid ${active ? "oklch(0.78 0.14 260 / 0.55)" : "rgba(255,255,255,.07)"}`,
        borderRadius: 99,
        fontSize: 11.5,
        color: active ? ACCENT : "#c2c2c8",
        cursor: "pointer",
        fontFamily: "var(--font-sans)",
        transition: tx(["background-color", "border-color", "color"], "instant"),
      }}
    >
      {dot && dotColor && (
        <span style={{ width: 7, height: 7, borderRadius: 99, background: dotColor, flexShrink: 0 }} />
      )}
      {label}
    </button>
  );
}

export function QuickAdd({ onClose }: QuickAddProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDesc, setShowDesc] = useState(false);
  const [type, setType] = useState<"open" | "deadline">("open");
  const [when, setWhen] = useState<"inbox" | "today" | "tomorrow" | "nextweek">("inbox");
  const [priority, setPriority] = useState<"p1" | "p2" | "p3" | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  const addTask = useMutation(api.tasks.addTask);
  const { showError } = useToast();
  const today = getLocalDateString();
  const tomorrow = getTomorrowDateString();

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const getDeadline = (): string | undefined => {
    if (type !== "deadline") return undefined;
    if (when === "today") return today;
    if (when === "tomorrow") return tomorrow;
    return today;
  };

  const getScheduledDate = (): string | undefined => {
    if (when === "inbox") return undefined;
    if (when === "today") return today;
    if (when === "tomorrow") return tomorrow;
    if (when === "nextweek") {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return undefined;
  };

  const handleSubmit = async () => {
    if (!title.trim() || isSubmitting) return;
    try {
      setIsSubmitting(true);
      await addTask({
        title: title.trim(),
        type,
        deadline: getDeadline(),
        priority,
        scheduledDate: getScheduledDate(),
      });
      onClose();
    } catch {
      showError("Failed to add task");
    } finally {
      setIsSubmitting(false);
    }
  };

  const PRIORITY_COLORS: Record<string, string> = {
    p1: "oklch(0.7 0.2 25)",
    p2: "oklch(0.78 0.15 60)",
    p3: "oklch(0.75 0.1 230)",
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={T_FAST}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 62,
          background: "rgba(0,0,0,.55)",
          backdropFilter: "blur(8px)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          paddingTop: 120,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={T_BASE}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 600,
            background: "#101013",
            border: "1px solid rgba(255,255,255,.13)",
            borderRadius: 12,
            padding: "20px 22px",
            boxShadow: "0 40px 80px rgba(0,0,0,.6)",
          }}
        >
          {/* Header row */}
          <div className="flex items-center gap-2 mb-1.5">
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 99,
                background: type === "deadline" ? DEADLINE_COLOR : ACCENT,
                boxShadow: `0 0 8px ${type === "deadline" ? DEADLINE_COLOR : ACCENT}`,
              }}
            />
            <span
              style={{
                fontSize: 10,
                letterSpacing: 1.8,
                color: "#6b6b72",
                fontFamily: "var(--font-mono)",
                textTransform: "uppercase",
              }}
            >
              New {type === "deadline" ? "deadline" : "task"}
            </span>
            <div className="flex-1" />
            <button
              onClick={onClose}
              style={{
                background: "transparent",
                border: "none",
                color: "#6b6b72",
                fontSize: 16,
                cursor: "pointer",
                padding: 4,
              }}
            >
              ✕
            </button>
          </div>

          {/* Title */}
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !showDesc) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="What needs doing?"
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 19,
              color: "#ededef",
              fontFamily: "var(--font-sans)",
              padding: "4px 0",
              fontWeight: 500,
              letterSpacing: -0.2,
            }}
          />

          {/* Description toggle or textarea */}
          {showDesc ? (
            <textarea
              ref={descRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Add a description… (optional)"
              rows={3}
              style={{
                width: "100%",
                background: "transparent",
                border: "none",
                outline: "none",
                fontSize: 13,
                color: "#c2c2c8",
                fontFamily: "var(--font-sans)",
                padding: "6px 0",
                resize: "none",
                lineHeight: 1.5,
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => { setShowDesc(true); setTimeout(() => descRef.current?.focus(), 20); }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 0",
                background: "transparent",
                border: "none",
                color: "#6b6b72",
                fontSize: 11.5,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                <path d="M3 5h10M3 8h10M3 11h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              Add description
            </button>
          )}

          <div style={{ height: 1, background: "rgba(255,255,255,.07)", margin: "14px 0 12px" }} />

          {/* Type + When */}
          <div className="flex gap-1.5 flex-wrap">
            <Pill label="Open" active={type === "open"} onClick={() => setType("open")} dot dotColor={ACCENT} />
            <Pill label="Deadline" active={type === "deadline"} onClick={() => setType("deadline")} dot dotColor={DEADLINE_COLOR} />
            <span style={{ width: 1, background: "rgba(255,255,255,.07)", margin: "0 4px" }} />
            <Pill label="Inbox" active={when === "inbox"} onClick={() => setWhen("inbox")} />
            <Pill label="Today" active={when === "today"} onClick={() => setWhen("today")} />
            <Pill label="Tomorrow" active={when === "tomorrow"} onClick={() => setWhen("tomorrow")} />
            <Pill label="+1w" active={when === "nextweek"} onClick={() => setWhen("nextweek")} />
          </div>

          {/* Priority */}
          <div className="flex gap-1.5 mt-2.5 flex-wrap items-center">
            <span
              style={{
                fontSize: 9.5,
                letterSpacing: 1.8,
                color: "#6b6b72",
                fontFamily: "var(--font-mono)",
                padding: "4px 4px 4px 0",
              }}
            >
              PRIORITY
            </span>
            <Pill label="None" active={priority === undefined} onClick={() => setPriority(undefined)} />
            {(["p1", "p2", "p3"] as const).map((p) => (
              <Pill
                key={p}
                label={p.toUpperCase()}
                active={priority === p}
                onClick={() => setPriority(p)}
                dot
                dotColor={PRIORITY_COLORS[p]}
              />
            ))}
          </div>

          {/* Footer */}
          <div
            className="flex items-center mt-4 pt-3.5 gap-2.5"
            style={{ borderTop: "1px solid rgba(255,255,255,.07)" }}
          >
            <span style={{ fontSize: 11, color: "#6b6b72", fontFamily: "var(--font-mono)", letterSpacing: 0.5 }}>
              <kbd>↵</kbd> add · <kbd>esc</kbd> cancel
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "7px 14px",
                background: "transparent",
                border: "1px solid rgba(255,255,255,.07)",
                borderRadius: 4,
                color: "#ededef",
                fontSize: 12,
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!title.trim() || isSubmitting}
              style={{
                padding: "7px 18px",
                background: title.trim() ? ACCENT : "rgba(255,255,255,.07)",
                border: "none",
                borderRadius: 4,
                color: title.trim() ? "#0a0a0b" : "#6b6b72",
                fontSize: 12,
                fontWeight: 600,
                cursor: title.trim() ? "pointer" : "not-allowed",
                letterSpacing: 0.2,
                fontFamily: "var(--font-sans)",
                transition: tx(["background-color", "color"], "instant"),
              }}
            >
              {isSubmitting ? "Adding…" : "Add task"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
