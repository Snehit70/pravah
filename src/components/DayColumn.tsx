import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { memo, useEffect, useRef, useState } from "react";
import type { Task } from "../types";
import { getLocalDateString, daysBetween, DUE_SOON_DAYS } from "../lib/utils";
import { TIMELINE_COL_WIDTH } from "../lib/timelineLayout";

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
      setJustCompleted(true);
      const t = window.setTimeout(() => setJustCompleted(false), 600);
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
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 8px",
        background: hover ? "rgba(255,255,255,.055)" : "rgba(255,255,255,.025)",
        border: `1px solid ${hover ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.07)"}`,
        borderLeft: `2px solid ${leftBarColor}`,
        borderRadius: 4,
        fontSize: 11,
        fontFamily: "var(--font-sans)",
        fontWeight: task.type === "deadline" ? 500 : 400,
        color: isCompleted ? "#6b6b72" : "#ededef",
        textDecoration: isCompleted ? "line-through" : "none",
        cursor: "grab",
        userSelect: "none",
        opacity: isDragging ? 0.4 : 1,
        transform: CSS.Transform.toString(transform) + (hover && !isCompleted ? " translateY(-1px)" : ""),
        boxShadow: hover ? "0 2px 8px rgba(0,0,0,.3)" : "none",
        transition: "background .12s, border-color .12s, box-shadow .12s",
        animation: justCompleted ? "taskComplete .6s cubic-bezier(0.34, 1.56, 0.64, 1)" : undefined,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: isDragging ? 0.4 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
    >
      <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {task.title}
      </span>
      {task.priority && !hover && !isCompleted && (
        <span
          style={{
            fontSize: 8.5,
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
          style={{ fontSize: 9, color: "oklch(0.78 0.14 260)", fontFamily: "var(--font-mono)", letterSpacing: 1, opacity: 0.7 }}
        >
          ✦
        </span>
      )}
      {isOverdue && !hover && (
        <span style={{ fontSize: 9, color: "oklch(0.72 0.2 25)", fontFamily: "var(--font-mono)" }}>!</span>
      )}
    </motion.div>
  );
}

function GridDayColumnComponent({
  date,
  tasks,
  onTaskClick,
  today,
  hoverDate: _hoverDate,
  onHoverDate: _onHoverDate,
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
        width: TIMELINE_COL_WIDTH,
        flexShrink: 0,
        borderRight: "1px solid rgba(255,255,255,.07)",
        padding: "8px 6px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
        minHeight: isDeadlineLane ? 140 : 240,
        background: isOver
          ? "oklch(0.72 0.16 260 / 0.2)"
          : isToday
          ? "oklch(0.72 0.16 260 / 0.06)"
          : isWeekend
          ? "rgba(0,0,0,.15)"
          : "transparent",
        outline: isOver ? "1px dashed oklch(0.78 0.14 260 / 0.5)" : "none",
        outlineOffset: -1,
        transition: "background .15s, outline-color .15s",
      }}
    >
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
