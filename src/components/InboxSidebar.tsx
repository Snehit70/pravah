import { memo, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarDays, Check, Trash2, X } from "lucide-react";
import type { Task } from "../types";
import { INBOX_DROP_ID } from "../lib/taskRules";
import { formatTaskTime, getLocalDateString } from "../lib/utils";
import { tx } from "../lib/motion";

interface InboxSidebarProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onOpenQuickAdd?: () => void;
  goalNameByTaskId?: Record<string, string>;
  onScheduleTask?: (taskId: Task["_id"], targetDate: string) => void;
  onCompleteMany?: (taskIds: Task["_id"][]) => Promise<boolean>;
  onDeleteMany?: (taskIds: Task["_id"][]) => Promise<boolean>;
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

function InboxTaskComponent({
  task,
  onClick,
  goalName,
  selectMode,
  selected,
  onToggleSelect,
  onSchedule,
}: {
  task: Task;
  onClick: () => void;
  goalName?: string;
  selectMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onSchedule?: (date: string) => void;
}) {
  const { setNodeRef, attributes, listeners, transform, transition: dndTransition, isDragging } = useSortable({
    id: task._id,
    disabled: selectMode,
  });
  const [hover, setHover] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(getLocalDateString());

  const barColor = task.deadline ? "oklch(0.72 0.16 30)" : "oklch(0.78 0.14 260)";
  const isAgentAdded = task.source === "ai-agent";
  const sourceLabel = task.source ? SOURCE_LABEL[task.source] : null;
  const age = formatTaskAge(task.createdAt);

  return (
    // Outer div owns the dnd-kit transform (shift-to-make-room) so framer-motion
    // never touches the CSS transform property and can't fight with dnd-kit.
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        // dndTransition is null for the dragged item (follows cursor instantly)
        // and "transform 200ms ease" for every other item (smooth live shift).
        transition: dndTransition ?? undefined,
      }}
    >
      <motion.div
        {...attributes}
        {...listeners}
        style={{
          padding: "7px 10px 7px 14px",
          background: hover ? "rgba(255,255,255,.04)" : "rgba(255,255,255,.025)",
          border: `1px solid ${hover ? "rgba(255,255,255,.13)" : "rgba(255,255,255,.07)"}`,
          borderRadius: 4,
          fontSize: 12,
          color: "#ededef",
          cursor: isDragging ? "grabbing" : "grab",
          position: "relative",
          transition: tx(["background-color", "border-color", "opacity"], "instant"),
          userSelect: "none",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: isDragging ? 0.3 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (selectMode) {
          onToggleSelect();
          return;
        }
        const target = e.currentTarget as HTMLElement;
        type DocVT = Document & { startViewTransition?: (cb: () => void) => unknown };
        const doc = document as DocVT;
        if (typeof doc.startViewTransition === "function") {
          // Clear hover state so the snapshot doesn't capture the lifted
          // pointer affordance. Modal owns the enter animation; we just
          // tag the source element for the FLIP.
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
    >
      {selectMode && (
        <button
          type="button"
          aria-label={selected ? `Deselect ${task.title}` : `Select ${task.title}`}
          aria-pressed={selected}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          style={{
            position: "absolute",
            top: 9,
            left: 10,
            width: 16,
            height: 16,
            borderRadius: 4,
            border: `1px solid ${selected ? "oklch(0.78 0.14 260)" : "rgba(255,255,255,.2)"}`,
            background: selected ? "oklch(0.78 0.14 260)" : "transparent",
            color: "#101013",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          {selected && <Check size={11} strokeWidth={3} />}
        </button>
      )}
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
      <div className="flex items-center gap-1.5" style={{ paddingLeft: selectMode ? 22 : 0 }}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {task.title}
        </span>
        {goalName && (
          <span
            title={`Goal: ${goalName}`}
            style={{
              fontSize: 9,
              color: "oklch(0.78 0.14 260 / 0.9)",
              fontFamily: "var(--font-mono)",
              letterSpacing: 0.4,
              maxWidth: 92,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            ◈ {goalName}
          </span>
        )}
        {isAgentAdded && (
          <span
            title="Added by Kairo"
            style={{ fontSize: 9, color: "oklch(0.78 0.14 260)", fontFamily: "var(--font-mono)", letterSpacing: 0.6 }}
          >
            ✦
          </span>
        )}
      </div>
      {(sourceLabel || age || task.time) && (
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
          {task.time && <span style={{ color: "#8b8b94" }}>{formatTaskTime(task.time)}</span>}
          {age && <span style={{ color: "#45454a" }}>{age}</span>}
        </div>
      )}
      {!selectMode && onSchedule && (
        <div className="mt-2 flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
          {scheduleOpen ? (
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <input
                type="date"
                value={scheduleDate}
                min={getLocalDateString()}
                onChange={(e) => setScheduleDate(e.target.value)}
                aria-label={`Schedule ${task.title}`}
                onPointerDown={(e) => e.stopPropagation()}
                className="min-w-0 flex-1 rounded-[3px] border border-white/[0.1] bg-black/25 px-1.5 py-1 text-[10px] text-zinc-200 outline-none focus:border-[oklch(0.78_0.14_260_/_0.45)]"
              />
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  if (scheduleDate) onSchedule(scheduleDate);
                  setScheduleOpen(false);
                }}
                aria-label={`Confirm schedule for ${task.title}`}
                className="rounded-[3px] bg-[oklch(0.78_0.14_260_/_0.18)] p-1 text-[oklch(0.78_0.14_260)] hover:bg-[oklch(0.78_0.14_260_/_0.28)]"
              >
                <Check size={12} />
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  setScheduleOpen(false);
                }}
                aria-label={`Cancel scheduling ${task.title}`}
                className="rounded-[3px] p-1 text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setScheduleDate(getLocalDateString());
                setScheduleOpen(true);
              }}
              className="inline-flex items-center gap-1 rounded-[3px] border border-white/[0.08] px-1.5 py-1 text-[10px] text-zinc-500 hover:border-white/[0.16] hover:text-zinc-200"
            >
              <CalendarDays size={11} />
              Schedule
            </button>
          )}
        </div>
      )}
      </motion.div>
    </div>
  );
}

const InboxTask = memo(InboxTaskComponent);
InboxTask.displayName = "InboxTask";

function InboxSidebarComponent({
  tasks,
  onTaskClick,
  onOpenQuickAdd,
  goalNameByTaskId,
  onScheduleTask,
  onCompleteMany,
  onDeleteMany,
}: InboxSidebarProps) {
  const { setNodeRef, isOver } = useDroppable({ id: INBOX_DROP_ID });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "p1" | "p2" | "p3" | "none">("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  // Optimistic local order: set immediately on drop so the DOM already shows
  // the new order when dnd-kit clears its transforms, preventing the snap-back
  // "two animations" artifact. Cleared once server confirms the new order.
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);
  // Fallback: if the mutation fails the server order never changes, so the
  // reconciliation effect below never fires.  A 6 s timeout guarantees we
  // revert to server state even without a confirmation signal.
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const taskIds = tasks.map(t => t._id as string);
  const prevTaskIdsRef = useRef(taskIds);

  // When server sends back a new task list (e.g. after mutation confirms or a
  // task is added/removed), sync localOrder — but only if the set of IDs
  // changed (new/removed tasks), not just a reorder we already applied.
  useEffect(() => {
    const prev = prevTaskIdsRef.current;
    prevTaskIdsRef.current = taskIds;
    const prevSet = new Set(prev);
    const setsMatch = prev.length === taskIds.length && taskIds.every(id => prevSet.has(id));
    if (!setsMatch) {
      // A task was added or removed — reset optimistic state so new list shows
      setLocalOrder(null);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    } else if (localOrder) {
      // Same set of tasks, check if server order now matches our optimistic order
      const serverMatchesOptimistic = localOrder.every((id, i) => taskIds[i] === id);
      if (serverMatchesOptimistic) {
        setLocalOrder(null);
        if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskIds.join(",")]);

  useDndMonitor({
    onDragEnd({ active, over }) {
      if (!over || active.id === over.id) return;
      const activeId = active.id as string;
      const overId = over.id as string;
      // Only apply optimistic reorder for inbox items
      const base = localOrder ?? tasks.map(t => t._id as string);
      const oldIndex = base.indexOf(activeId);
      const newIndex = base.indexOf(overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      setLocalOrder(arrayMove(base, oldIndex, newIndex));
      // If the mutation fails the server order won't change, so the
      // reconciliation effect never fires.  Revert after 6 s as a fallback.
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = setTimeout(() => setLocalOrder(null), 6000);
    },
    onDragCancel() {
      setLocalOrder(null);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    },
  });

  // Reorder the task objects to match localOrder when set
  const orderedTasks = localOrder
    ? (localOrder.map(id => tasks.find(t => t._id === id)).filter(Boolean) as typeof tasks)
    : tasks;

  const filtered = useMemo(
    () => orderedTasks.filter((task) => {
      if (filter !== "all" && (task.priority ?? "none") !== filter) return false;
      if (!query) return true;
      const needle = query.toLowerCase();
      return `${task.title} ${task.description ?? ""}`.toLowerCase().includes(needle);
    }),
    [filter, orderedTasks, query]
  );
  const visibleSelectedIds = useMemo(
    () => new Set(filtered.filter((task) => selectedIds.has(String(task._id))).map((task) => String(task._id))),
    [filtered, selectedIds]
  );
  const allFilteredSelected = filtered.length > 0 && filtered.every((task) => visibleSelectedIds.has(String(task._id)));
  const kairoCount = tasks.filter(t => t.source === "ai-agent").length;

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelectAll = () => {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filtered.map((task) => String(task._id))));
  };

  const runBulk = async (action: ((taskIds: Task["_id"][]) => Promise<boolean>) | undefined) => {
    if (!action || visibleSelectedIds.size === 0) return;
    const selectedTasks = tasks.filter((task) => visibleSelectedIds.has(String(task._id)));
    const succeeded = await action(selectedTasks.map((task) => task._id));
    if (succeeded) exitSelectMode();
  };

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
        transition: tx("background-color", "fast"),
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
        {tasks.length > 0 && (selectMode ? (
          <button
            type="button"
            onClick={exitSelectMode}
            className="inline-flex items-center gap-1 rounded-[4px] border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-500 hover:text-zinc-200"
          >
            <X size={11} /> Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setSelectMode(true)}
            className="rounded-[4px] border border-white/[0.08] px-2 py-1 text-[10px] text-zinc-500 hover:border-white/[0.16] hover:text-zinc-200"
          >
            Select
          </button>
        ))}
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
            transition: tx(["border-color", "background-color"], "instant"),
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
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Inbox priority filter">
          {([
            ["all", "All"],
            ["p1", "P1"],
            ["p2", "P2"],
            ["p3", "P3"],
            ["none", "None"],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={filter === value
                ? "rounded-[3px] border border-[oklch(0.78_0.14_260_/_0.45)] bg-[oklch(0.72_0.16_260_/_0.2)] px-2 py-1 text-[10px] text-[oklch(0.78_0.14_260)]"
                : "rounded-[3px] border border-white/[0.07] px-2 py-1 text-[10px] text-zinc-600 hover:text-zinc-300"}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: "10px", display: "flex", flexDirection: "column", gap: 5 }}
      >
        <SortableContext
          items={query || filter !== "all" || selectMode ? [] : filtered.map(t => t._id)}
          strategy={verticalListSortingStrategy}
        >
          <AnimatePresence>
            {filtered.map((task) => (
              <InboxTask
                key={task._id}
                task={task}
                goalName={goalNameByTaskId?.[String(task._id)]}
                selectMode={selectMode}
                selected={visibleSelectedIds.has(String(task._id))}
                onToggleSelect={() => setSelectedIds((previous) => {
                  const next = new Set(previous);
                  const key = String(task._id);
                  if (next.has(key)) next.delete(key); else next.add(key);
                  return next;
                })}
                onSchedule={onScheduleTask ? (date) => onScheduleTask(task._id, date) : undefined}
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
        {selectMode && (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-[10px] text-zinc-500 hover:text-zinc-200"
              >
                {allFilteredSelected ? "Deselect all" : "Select all"}
              </button>
              <span className="text-[10px] text-zinc-600">{visibleSelectedIds.size} selected</span>
            </div>
            <div className="mb-2 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                disabled={visibleSelectedIds.size === 0 || !onDeleteMany}
                onClick={() => void runBulk(onDeleteMany)}
                className="inline-flex items-center justify-center gap-1 rounded-[4px] border border-red-400/30 px-2 py-2 text-[10px] text-red-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 size={11} /> Delete
              </button>
              <button
                type="button"
                disabled={visibleSelectedIds.size === 0 || !onCompleteMany}
                onClick={() => void runBulk(onCompleteMany)}
                className="inline-flex items-center justify-center gap-1 rounded-[4px] border border-emerald-400/30 px-2 py-2 text-[10px] text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Check size={11} /> Mark done
              </button>
            </div>
          </>
        )}
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
