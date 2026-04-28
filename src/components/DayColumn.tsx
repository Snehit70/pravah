import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useRef, useState } from "react";
import type { Task } from "../types";
import { getLocalDateString, daysBetween, DUE_SOON_DAYS } from "../lib/utils";
import { TIMELINE_COL_WIDTH } from "../lib/timelineLayout";
import { tx, T_FAST, EASE_OUT_EXPO } from "../lib/motion";

interface GridDayColumnProps {
  date: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  today: string;
  hoverDate: string | null;
  onHoverDate: (date: string | null) => void;
  isDeadlineLane?: boolean;
}

function GridTaskRow({ task, onClick }: { task: Task; onClick: () => void }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useSortable({
    id: task._id,
  });
  const [hover, setHover] = useState(false);

  const today = getLocalDateString();
  const isCompleted = task.status === "completed";
  const isOverdue =
    task.type === "deadline" && !!task.deadline && task.deadline < today && !isCompleted;
  const isDueSoon =
    task.type === "deadline" &&
    !!task.deadline &&
    !isOverdue &&
    !isCompleted &&
    daysBetween(today, task.deadline) <= DUE_SOON_DAYS;

  const leftBarColor = isCompleted
    ? "oklch(0.78 0.18 150)"
    : isOverdue
    ? "oklch(0.72 0.2 25)"
    : isDueSoon
    ? "oklch(0.78 0.15 60)"
    : task.type === "deadline"
    ? "oklch(0.72 0.16 30)"
    : task.priority === "p1"
    ? "oklch(0.7 0.2 25)"
    : "oklch(0.78 0.14 260)";

  const isAgentAdded = task.source === "ai-agent";

  const wasCompletedRef = useRef(isCompleted);
  const [justCompleted, setJustCompleted] = useState(false);
  useEffect(() => {
    if (!wasCompletedRef.current && isCompleted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJustCompleted(true);
      const t = window.setTimeout(() => setJustCompleted(false), 520);
      wasCompletedRef.current = isCompleted;
      return () => window.clearTimeout(t);
    }
    wasCompletedRef.current = isCompleted;
  }, [isCompleted]);

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 34,
        padding: "8px 10px",
        background: hover ? "rgba(255,255,255,.055)" : "rgba(255,255,255,.025)",
        borderTop: `1px solid ${hover ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.07)"}`,
        borderRight: `1px solid ${hover ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.07)"}`,
        borderBottom: `1px solid ${hover ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.07)"}`,
        borderLeft: `3px solid ${leftBarColor}`,
        borderRadius: 5,
        fontSize: 12,
        fontFamily: "var(--font-sans)",
        fontWeight: task.type === "deadline" ? 500 : 400,
        color: isCompleted ? "#6b6b72" : "#ededef",
        textDecoration: isCompleted ? "line-through" : "none",
        cursor: "grab",
        userSelect: "none",
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Transform.toString(transform) + (hover && !isCompleted ? " translateY(-1px)" : ""),
        boxShadow: hover ? "0 2px 8px rgba(0,0,0,.3)" : "none",
        transition: tx(["background-color", "border-top-color", "border-right-color", "border-bottom-color", "box-shadow", "transform"], "instant"),
        animation: justCompleted ? `taskCompleteRow 520ms ${`cubic-bezier(${EASE_OUT_EXPO.join(",")})`} forwards` : undefined,
        willChange: hover ? "transform" : undefined,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        const target = e.currentTarget as HTMLElement;
        type DocVT = Document & { startViewTransition?: (cb: () => void) => unknown };
        const doc = document as DocVT;
        if (typeof doc.startViewTransition === "function") {
          // Clear hover-driven transform/shadow before the browser snapshots
          // this element. Otherwise the snapshot captures translateY(-1px)
          // and the morph appears to jump on enter.
          setHover(false);
          target.style.viewTransitionName = "task-morph";
          const transition = doc.startViewTransition(() => {
            onClick();
          }) as { finished?: Promise<void> } | undefined;
          const clear = () => {
            target.style.viewTransitionName = "";
          };
          if (transition?.finished) {
            transition.finished.then(clear, clear);
          } else {
            window.setTimeout(clear, 600);
          }
        } else {
          onClick();
        }
      }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0, transition: T_FAST }}
      exit={{ opacity: 0, scale: 0.96, transition: T_FAST }}
      layout
    >
      {/* Completion sweep — a 1px accent line scans across the row once. */}
      {justCompleted && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: "auto 0 0 0",
            height: 1,
            background: "oklch(0.78 0.18 150)",
            boxShadow: "0 0 8px oklch(0.78 0.18 150 / 0.55)",
            animation: `taskCompleteSweep 520ms cubic-bezier(${EASE_OUT_EXPO.join(",")}) forwards`,
            pointerEvents: "none",
          }}
        />
      )}
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {task.title}
      </span>
      {task.priority && !hover && !isCompleted && (
        <span
          style={{
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            color: task.priority === "p1" ? "oklch(0.78 0.18 25)" : "#6b6b72",
            letterSpacing: 1,
            opacity: 0.85,
          }}
        >
          {task.priority.toUpperCase()}
        </span>
      )}
      {isAgentAdded && !hover && (
        <span
          title="Added by Kairo"
          style={{ fontSize: 10, color: "oklch(0.78 0.14 260)", fontFamily: "var(--font-mono)", letterSpacing: 1, opacity: 0.7 }}
        >
          ✦
        </span>
      )}
      {isOverdue && !hover && (
        <span style={{ fontSize: 10, color: "oklch(0.72 0.2 25)", fontFamily: "var(--font-mono)" }}>!</span>
      )}
    </motion.div>
  );
}

function GridDayColumnComponent({
  date,
  tasks,
  onTaskClick,
  today,
  isDeadlineLane = false,
}: GridDayColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: date });
  const isToday = date === today;
  const d = new Date(date + "T12:00:00");
  const isWeekend = d.getDay() === 0 || d.getDay() === 6;

  return (
    <div
      ref={setNodeRef}
      onDragOver={(e) => e.preventDefault()}
      style={{
        position: "relative",
        width: TIMELINE_COL_WIDTH,
        flexShrink: 0,
        borderRight: "1px solid rgba(255,255,255,.07)",
        padding: "9px 8px",
        display: "flex",
        flexDirection: "column",
        gap: 5,
        minHeight: isDeadlineLane ? 140 : 240,
        background: isOver
          ? "oklch(0.72 0.16 260 / 0.18)"
          : isToday
          ? "oklch(0.72 0.16 260 / 0.06)"
          : isWeekend
          ? "rgba(0,0,0,.15)"
          : "transparent",
        transition: tx("background-color", "fast"),
      }}
    >
      {/* Drop-zone affordance: top + bottom accent strokes scan in via clip-path
          when this column is the active drop target. No outline-color fade. */}
      {isOver && (
        <>
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: "0 0 auto 0",
              height: 1,
              background: "oklch(0.78 0.14 260)",
              boxShadow: "0 0 12px oklch(0.78 0.14 260 / 0.55)",
              animation: `dropZoneIn 220ms cubic-bezier(${EASE_OUT_EXPO.join(",")}) forwards`,
              pointerEvents: "none",
            }}
          />
          <span
            aria-hidden
            style={{
              position: "absolute",
              inset: "auto 0 0 0",
              height: 1,
              background: "oklch(0.78 0.14 260)",
              boxShadow: "0 0 12px oklch(0.78 0.14 260 / 0.55)",
              animation: `dropZoneIn 220ms cubic-bezier(${EASE_OUT_EXPO.join(",")}) forwards`,
              pointerEvents: "none",
            }}
          />
        </>
      )}
      <SortableContext items={tasks.map(t => t._id)} strategy={verticalListSortingStrategy}>
        <AnimatePresence mode="popLayout">
          {tasks.map((task) => (
            <GridTaskRow
              key={task._id}
              task={task}
              onClick={() => onTaskClick(task)}
            />
          ))}
        </AnimatePresence>
      </SortableContext>
    </div>
  );
}

export const GridDayColumn = memo(GridDayColumnComponent);
GridDayColumn.displayName = "GridDayColumn";

// Keep DayColumn as an alias for backward compat
export { GridDayColumn as DayColumn };
