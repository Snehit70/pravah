import { memo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Task } from "../types";
import { INBOX_DROP_ID } from "../lib/taskRules";

interface InboxSidebarProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onOpenQuickAdd?: () => void;
}

function PulsingDot({ color, size = 6 }: { color: string; size?: number }) {
  return (
    <span style={{ display: "inline-block", position: "relative", width: size, height: size, flexShrink: 0 }}>
      <span style={{ position: "absolute", inset: 0, borderRadius: 99, background: color }} />
      <span style={{
        position: "absolute", inset: 0, borderRadius: 99, background: color,
        animation: "pravahPulse 2s ease-out infinite", opacity: 0.5,
      }} />
    </span>
  );
}

const SOURCE_LABEL: Record<NonNullable<Task["source"]>, string> = {
  "manual": "MANUAL",
  "ai-agent": "KAIRO",
  "gmail": "GMAIL",
  "gcal": "GCAL",
};

function formatTaskAge(createdAt: number): string {
  const ms = Date.now() - createdAt;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.floor(d / 30);
  return `${mo}mo`;
}

function InboxTaskComponent({ task, onClick }: { task: Task; onClick: () => void }) {
  const { setNodeRef, attributes, listeners, transform, isDragging } = useSortable({
    id: task._id,
  });
  const [hover, setHover] = useState(false);

  const barColor = task.type === "deadline" ? "oklch(0.72 0.16 30)" : "oklch(0.78 0.14 260)";
  const isAgentAdded = task.source === "ai-agent";
  const sourceLabel = task.source ? SOURCE_LABEL[task.source] : null;
  const age = formatTaskAge(task.createdAt);

  return (
    <motion.div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{
        transform: CSS.Transform.toString(transform),
        padding: "7px 10px 7px 14px",
        background: hover ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.025)",
        border: `1px solid ${hover ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.07)"}`,
        borderRadius: 4,
        fontSize: 12,
        color: "#ededef",
        cursor: "grab",
        position: "relative",
        opacity: isDragging ? 0.4 : 1,
        transition: "background .15s, border-color .15s, opacity .15s",
        userSelect: "none",
      }}
      initial={{ opacity: 0, x: 10 }}
      animate={{ opacity: isDragging ? 0.4 : 1, x: 0 }}
      exit={{ opacity: 0, x: -10, scale: 0.95 }}
      layout
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {/* Left bar */}
      <span
        style={{
          position: "absolute",
          left: 6,
          top: "50%",
          transform: "translateY(-50%)",
          width: 4,
          height: "60%",
          background: barColor,
          borderRadius: 2,
        }}
      />
      <div className="flex items-center gap-1.5">
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </span>
        {isAgentAdded && (
          <span
            title="Added by Kairo"
            style={{ fontSize: 9, color: "oklch(0.78 0.14 260)", fontFamily: "var(--font-mono)", letterSpacing: 0.6 }}
          >
            ✦
          </span>
        )}
      </div>
      {(sourceLabel || age) && (
        <div
          className="tabular"
          style={{
            marginTop: 3,
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: 0.6,
            color: "#6b6b72",
            display: "flex",
            gap: 8,
          }}
        >
          {sourceLabel && (
            <span style={{ color: isAgentAdded ? "oklch(0.78 0.14 260 / 0.85)" : "#6b6b72" }}>
              {sourceLabel}
            </span>
          )}
          {age && <span style={{ color: "#45454a" }}>{age}</span>}
        </div>
      )}
    </motion.div>
  );
}

const InboxTask = memo(InboxTaskComponent);
InboxTask.displayName = "InboxTask";

function InboxSidebarComponent({
  tasks,
  onTaskClick,
  onOpenQuickAdd,
}: InboxSidebarProps) {
  const { setNodeRef, isOver } = useDroppable({ id: INBOX_DROP_ID });
  const [query, setQuery] = useState("");

  const filtered = query
    ? tasks.filter(t => t.title.toLowerCase().includes(query.toLowerCase()))
    : tasks;
  const kairoCount = tasks.filter(t => t.source === "ai-agent").length;

  return (
    <div
      ref={setNodeRef}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: 300,
        background: isOver ? "oklch(0.72 0.16 260 / 0.1)" : "#101013",
        borderLeft: "1px solid rgba(255,255,255,.07)",
        outline: isOver ? "1px dashed oklch(0.78 0.14 260 / 0.5)" : "none",
        outlineOffset: -2,
        transition: "background .15s",
      }}
    >
      {/* Header */}
      <div
        className="flex items-start gap-2 px-[14px] py-3"
        style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}
      >
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 13, fontWeight: 500, color: "#ededef" }}>Inbox</span>
            <span
              className="tabular"
              style={{
                fontSize: 11,
                padding: "1px 7px",
                borderRadius: 99,
                background: "oklch(0.72 0.16 260 / 0.2)",
                color: "oklch(0.78 0.14 260)",
                fontFamily: "var(--font-mono)",
              }}
            >
              {tasks.length}
            </span>
          </div>
          {kairoCount > 0 && (
            <span
              className="tabular"
              style={{
                fontSize: 9,
                fontFamily: "var(--font-mono)",
                color: "#6b6b72",
                letterSpacing: 0.6,
              }}
            >
              {kairoCount} from kairo
            </span>
          )}
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 mt-1">
          <PulsingDot color="oklch(0.78 0.18 150)" size={6} />
          <span style={{ fontSize: 9, color: "#6b6b72", fontFamily: "var(--font-mono)", letterSpacing: 0.6 }}>
            MCP
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="px-2.5 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,.07)" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search inbox…"
          style={{
            width: "100%",
            background: "rgba(0,0,0,.25)",
            border: "1px solid rgba(255,255,255,.09)",
            boxShadow: "inset 0 1px 0 rgba(0,0,0,.3)",
            borderRadius: 4,
            padding: "6px 10px",
            color: "#ededef",
            fontSize: 12,
            outline: "none",
            transition: "border-color .15s, background .15s",
          }}
          onFocus={(e) => {
            e.target.style.borderColor = "oklch(0.78 0.14 260 / 0.4)";
            e.target.style.background = "rgba(0,0,0,.35)";
          }}
          onBlur={(e) => {
            e.target.style.borderColor = "rgba(255,255,255,.09)";
            e.target.style.background = "rgba(0,0,0,.25)";
          }}
        />
      </div>

      {/* Task list */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 5 }}
      >
        <SortableContext
          items={filtered.map(t => t._id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence mode="popLayout">
            {filtered.map((task) => (
              <InboxTask
                key={task._id}
                task={task}
                onClick={() => onTaskClick(task)}
              />
            ))}
          </AnimatePresence>
        </SortableContext>
        {filtered.length === 0 && (
          <div
            style={{ textAlign: "center", padding: "40px 10px", fontSize: 12, color: "#6b6b72" }}
          >
            {query ? "No matches." : "Inbox is clear."}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: 10, borderTop: "1px solid rgba(255,255,255,.07)" }}>
        {onOpenQuickAdd && (
          <button
            onClick={onOpenQuickAdd}
            style={{
              width: "100%",
              padding: "8px 12px",
              borderRadius: 4,
              border: "1px solid oklch(0.78 0.14 260 / 0.4)",
              background: "oklch(0.72 0.16 260 / 0.2)",
              color: "oklch(0.78 0.14 260)",
              fontSize: 12,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              fontFamily: "var(--font-sans)",
            }}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> New task
          </button>
        )}
      </div>
    </div>
  );
}

export const InboxSidebar = memo(InboxSidebarComponent);
InboxSidebar.displayName = "InboxSidebar";
