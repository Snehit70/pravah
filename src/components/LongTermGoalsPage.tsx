import { useEffect, useMemo, useRef, useState } from "react";
import { Reorder, motion } from "framer-motion";
import { cn, getLocalDateString } from "../lib/utils";
import { EASE_OUT_EXPO } from "../lib/motion";
import { GripHorizontalIcon, PlusIcon, TrashIcon } from "./ui/icons";
import { navGoalsIcon } from "./ui/traced-icons";
import type { Task } from "../types";
import { GoalCard } from "./goals/GoalCard";
import { GoalTasks } from "./goals/GoalTasks";

const NavGoalsGlyph = navGoalsIcon;

const STORAGE_KEY = "pravah_long_term_goals";

interface GoalItem {
  id: string;
  text: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
}

export interface GoalReadModel {
  id: string;
  text: string;
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
  createdAt?: number;
}

export interface GoalProgress {
  total: number;
  done: number;
}

interface GoalCreateFields {
  description?: string;
  deadline?: string;
  priority?: "p1" | "p2" | "p3";
}

interface LongTermGoalsPageProps {
  readOnly?: boolean;
  inboxVisible?: boolean;
  onToggleInbox?: () => void;
  serverBacked?: boolean;
  serverGoals?: GoalReadModel[];
  progressByGoalId?: Record<string, GoalProgress>;
  onCreateServerGoal?: (text: string, fields?: GoalCreateFields) => Promise<void>;
  onUpdateServerGoal?: (goalId: string, patch: Pick<GoalReadModel, "text" | "description" | "deadline" | "priority">) => Promise<void>;
  onDeleteServerGoal?: (goalId: string) => Promise<void>;
  linkedTasksByGoalId?: Record<string, Task[]>;
  onOpenTask?: (task: Task) => void;
}

export function LongTermGoalsPage({
  readOnly = false,
  inboxVisible = false,
  onToggleInbox,
  serverBacked = false,
  serverGoals,
  progressByGoalId,
  onCreateServerGoal,
  onUpdateServerGoal,
  onDeleteServerGoal,
  linkedTasksByGoalId = {},
  onOpenTask,
}: LongTermGoalsPageProps = {}) {
  const [draft, setDraft] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftDeadline, setDraftDeadline] = useState("");
  const [draftPriority, setDraftPriority] = useState<"p1" | "p2" | "p3" | undefined>(undefined);
  const [composerFocused, setComposerFocused] = useState(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "finished">("active");
  const [sort, setSort] = useState("priority");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editDescription, setEditDescription] = useState("");
  const [editDeadline, setEditDeadline] = useState("");
  const [editPriority, setEditPriority] = useState<"p1" | "p2" | "p3" | undefined>(undefined);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const [goals, setGoals] = useState<GoalItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved) as GoalItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (value) =>
          value &&
          typeof value === "object" &&
          typeof value.id === "string" &&
          typeof value.text === "string"
      );
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (serverBacked) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  }, [goals, serverBacked]);

  const displayGoals = useMemo<GoalReadModel[]>(() => {
    if (serverBacked && serverGoals) {
      return [...serverGoals].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    }
    return goals;
  }, [goals, serverBacked, serverGoals]);

  const composerOpen =
    composerFocused ||
    draft.trim() !== "" ||
    draftDescription.trim() !== "" ||
    draftDeadline !== "" ||
    draftPriority !== undefined;

  const resetComposer = () => {
    setDraft("");
    setDraftDescription("");
    setDraftDeadline("");
    setDraftPriority(undefined);
  };

  const addGoal = async () => {
    const text = draft.trim();
    if (!text) return;
    const description = draftDescription.trim();
    const fields: GoalCreateFields | undefined =
      description || draftDeadline || draftPriority
        ? {
            description: description || undefined,
            deadline: draftDeadline || undefined,
            priority: draftPriority,
          }
        : undefined;
    if (serverBacked) {
      if (!onCreateServerGoal) return;
      setServerBusy(true);
      setServerError(null);
      try {
        if (fields) {
          await onCreateServerGoal(text, fields);
        } else {
          await onCreateServerGoal(text);
        }
        resetComposer();
      } catch {
        setServerError("Could not create goal. Try again.");
      } finally {
        setServerBusy(false);
      }
      return;
    }
    setGoals((prev) => [
      ...prev,
      {
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        description: description || undefined,
        deadline: draftDeadline || undefined,
        priority: draftPriority,
      },
    ]);
    resetComposer();
  };

  const removeGoal = async (goalId: string) => {
    if (serverBacked) {
      if (!onDeleteServerGoal) return;
      setServerBusy(true);
      setServerError(null);
      try {
        await onDeleteServerGoal(goalId);
        setConfirmDeleteId(null);
        setSelectedGoalId((current) => current === goalId ? null : current);
      } catch {
        setServerError("Could not delete goal. Try again.");
      } finally {
        setServerBusy(false);
      }
      return;
    }
    setGoals((prev) => prev.filter((goal) => goal.id !== goalId));
  };

  const beginEdit = (goal: GoalReadModel) => {
    setEditingGoalId(goal.id);
    setEditTitle(goal.text);
    setEditDescription(goal.description ?? "");
    setEditDeadline(goal.deadline ?? "");
    setEditPriority(goal.priority);
    setServerError(null);
  };

  const saveEdit = async (goal: GoalReadModel) => {
    if (!onUpdateServerGoal) return;
    if (!editTitle.trim()) {
      setServerError("Give the goal a name before saving.");
      return;
    }
    setServerBusy(true);
    setServerError(null);
    try {
      await onUpdateServerGoal(goal.id, {
        text: editTitle.trim(),
        description: editDescription.trim() || undefined,
        deadline: editDeadline || undefined,
        priority: editPriority,
      });
      setEditingGoalId(null);
    } catch {
      setServerError("Could not update goal. Try again.");
    } finally {
      setServerBusy(false);
    }
  };

  const isFinished = (goal: GoalReadModel) => {
    const progress = progressByGoalId?.[goal.id];
    return Boolean(progress && progress.total > 0 && progress.done >= progress.total);
  };
  const finishedCount = displayGoals.filter(isFinished).length;
  const today = getLocalDateString();
  const visibleGoals = displayGoals.filter((goal) => {
    const matchesStatus = status === "all" || (status === "finished" ? isFinished(goal) : !isFinished(goal));
    return matchesStatus && `${goal.text} ${goal.description ?? ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => {
    if (sort === "name") return a.text.localeCompare(b.text);
    if (sort === "newest") return (b.createdAt ?? 0) - (a.createdAt ?? 0);
    if (sort === "deadline") return (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999");
    const rank = { p1: 0, p2: 1, p3: 2 };
    return (a.priority ? rank[a.priority] : 3) - (b.priority ? rank[b.priority] : 3)
      || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.text.localeCompare(b.text);
  });
  const selectedGoal = displayGoals.find((goal) => goal.id === selectedGoalId);
  const renderGoal = (goal: GoalReadModel, detail = false) => (
    <GoalCard
      key={goal.id}
      goal={goal}
      progress={progressByGoalId?.[goal.id] ?? { total: 0, done: 0 }}
      linkedTasks={detail ? [] : linkedTasksByGoalId[goal.id] ?? []}
      busy={serverBusy}
      canEdit={!readOnly && Boolean(onUpdateServerGoal)}
      canDelete={!readOnly && Boolean(onDeleteServerGoal)}
      editing={editingGoalId === goal.id}
      onBeginEdit={() => beginEdit(goal)}
      onOpenGoal={detail ? undefined : () => { setSelectedGoalId(goal.id); setEditingGoalId(null); }}
      onOpenTask={onOpenTask}
      onRemove={() => setConfirmDeleteId(goal.id)}
      editFields={{
        title: editTitle, description: editDescription, deadline: editDeadline, priority: editPriority,
        setTitle: setEditTitle, setDescription: setEditDescription, setDeadline: setEditDeadline, setPriority: setEditPriority,
      }}
      onSaveEdit={() => void saveEdit(goal)}
      onCancelEdit={() => setEditingGoalId(null)}
    />
  );

  return (
    <div className="h-full overflow-y-auto bg-[var(--color-bg-base)]">
      <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col px-4 pb-28 pt-6 sm:px-6">
        {onToggleInbox && <button type="button" aria-expanded={inboxVisible} onClick={onToggleInbox} className="mb-3 min-h-11 self-end rounded-md border border-line px-3 text-sm text-ink-soft">{inboxVisible ? "Hide inbox" : "Show inbox"}</button>}
        {serverError && <p role="alert" className="mb-4 text-sm text-error">{serverError}</p>}
        {confirmDeleteId && (
          <section aria-label="Confirm goal deletion" className="mb-5 rounded-lg border border-error/30 bg-[var(--color-bg-elevated)] p-4">
            <p className="text-sm font-semibold text-ink">Delete {displayGoals.find((goal) => goal.id === confirmDeleteId)?.text}?</p>
            <p className="mt-1 text-sm text-ink-soft">Its tasks will stay in your workspace, but their links to this goal will be removed. This cannot be undone.</p>
            <div className="mt-3 flex gap-3">
              <button type="button" disabled={serverBusy} className="min-h-11 rounded-md border border-line px-4 text-sm" onClick={() => setConfirmDeleteId(null)}>Keep goal</button>
              <button type="button" disabled={serverBusy} className="min-h-11 rounded-md border border-error/30 px-4 text-sm text-error" onClick={() => { void removeGoal(confirmDeleteId); }}>Delete goal permanently</button>
            </div>
          </section>
        )}
        {serverBacked && selectedGoal ? (
          <>
            <button type="button" className="mb-4 min-h-11 self-start rounded-md px-2 text-sm text-ink-soft hover:bg-fill-soft" onClick={() => { setSelectedGoalId(null); setEditingGoalId(null); }}>← All goals</button>
            {renderGoal(selectedGoal, true)}
            <GoalTasks key={selectedGoal.id} goal={selectedGoal} progress={progressByGoalId?.[selectedGoal.id]} onOpenTask={onOpenTask} readOnly={readOnly} />
          </>
        ) : (
          <>
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-ink-soft">{displayGoals.length - finishedCount} active · {finishedCount} finished</p>
            <p className="mt-1 text-xs text-ink-mute">Open a goal to see all its linked tasks.</p>
          </div>
          {serverBacked && <p className="text-xs text-ink-mute">{displayGoals.filter((goal) => goal.deadline && goal.deadline < today && !isFinished(goal)).length} overdue goals</p>}
        </div>
        {serverBacked && (
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <input type="search" aria-label="Search goals" placeholder="Search goals…" value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-11 min-w-0 flex-1 rounded-md border border-line bg-[var(--color-bg-surface)] px-3 text-sm text-ink" />
            <div role="group" aria-label="Goal status" className="flex gap-1">
              {(["active", "finished", "all"] as const).map((value) => <button key={value} type="button" aria-pressed={status === value} onClick={() => setStatus(value)} className={cn("min-h-11 rounded-md border px-3 text-sm capitalize", status === value ? "border-accent bg-[var(--color-accent-dim)] text-accent" : "border-line text-ink-soft")}>{value}</button>)}
            </div>
            <label className="flex items-center gap-2 text-xs text-ink-mute">Sort
              <select aria-label="Sort goals" value={sort} onChange={(event) => setSort(event.target.value)} className="min-h-11 rounded-md border border-line bg-[var(--color-bg-surface)] px-2 text-sm text-ink">
                <option value="priority">Priority</option><option value="deadline">Deadline</option><option value="name">Name</option><option value="newest">Newest</option>
              </select>
            </label>
          </div>
        )}
        {/* Composer: title + optional notes/priority/deadline, revealed on focus.
            Mirrors the mobile AddTaskSheet "New goal" kind. */}
        {!readOnly && (
          <div
            className={cn(
              "mb-5 rounded-[12px] border bg-[var(--color-bg-elevated)] transition-colors duration-150",
              composerOpen ? "border-accent/45" : "border-line-subtle hover:border-line"
            )}
            onFocus={() => setComposerFocused(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setComposerFocused(false);
              }
            }}
          >
            <div className="flex items-center gap-2.5 px-2.5 py-2">
              <span
                aria-hidden
                className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] border border-line-subtle bg-[var(--color-bg-surface)] text-ink-mute"
              >
                <NavGoalsGlyph size={15} />
              </span>
              <input
                ref={addInputRef}
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void addGoal();
                }}
                placeholder="What do you want to achieve?"
                aria-label="Goal title"
                disabled={serverBusy}
                className="min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-ink-mute"
              />
              <button
                type="button"
                onClick={() => void addGoal()}
                disabled={serverBusy}
                className={cn(
                  "grid h-11 w-11 shrink-0 place-items-center rounded-[9px]",
                  "bg-accent text-canvas transition-opacity hover:opacity-90",
                  "disabled:opacity-50"
                )}
                aria-label="Add long-term goal"
              >
                <PlusIcon size={15} strokeWidth={2.4} />
              </button>
            </div>
            {composerOpen && (
              <div className="space-y-2 border-t border-line-subtle px-2.5 pb-2.5 pt-2.5">
                <input
                  type="text"
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void addGoal();
                  }}
                  placeholder="Optional notes"
                  aria-label="Goal notes"
                  disabled={serverBusy}
                  className="w-full rounded-[8px] border border-line bg-fill-soft px-2.5 py-2 text-xs text-ink outline-none placeholder:text-ink-dim focus:border-accent/45"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <PriorityChips
                    value={draftPriority}
                    onChange={setDraftPriority}
                    groupLabel="New goal priority"
                  />
                  <div className="flex-1" />
                  <input
                    type="date"
                    value={draftDeadline}
                    onChange={(event) => setDraftDeadline(event.target.value)}
                    aria-label="New goal deadline"
                    disabled={serverBusy}
                    className="rounded-[8px] border border-line bg-fill-soft px-2 py-1.5 text-xs text-ink outline-none focus:border-accent/45"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {displayGoals.length === 0 ? (
          <GoalsEmptyState
            serverBacked={serverBacked}
            showAddPill={!readOnly}
            onAddClick={() => addInputRef.current?.focus()}
          />
        ) : serverBacked ? (
          <section aria-label="Goals" className="border-t border-line-subtle">
            {visibleGoals.length === 0 ? <div className="py-12 text-center"><p className="text-sm font-medium text-ink">No goals match this view.</p><button type="button" className="mt-3 min-h-11 px-3 text-sm text-accent" onClick={() => { setQuery(""); setStatus("all"); }}>Show all goals</button></div> : visibleGoals.map((goal) => renderGoal(goal))}
          </section>
        ) : (
          <Reorder.Group axis="y" values={goals} onReorder={setGoals} className="flex flex-col gap-2">
            {goals.map((goal) => (
              <Reorder.Item
                key={goal.id}
                value={goal}
                whileDrag={{ scale: 1.01 }}
                className={cn(
                  "group flex items-center gap-3 rounded-[10px] border border-line-subtle",
                  "bg-[var(--color-bg-elevated)] px-3 py-2.5 cursor-grab active:cursor-grabbing",
                  "transition-colors hover:border-line-strong hover:bg-[var(--color-bg-floating)]"
                )}
              >
                <span
                  aria-hidden
                  className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] border border-line-subtle bg-[var(--color-bg-surface)] text-ink-mute"
                >
                  <NavGoalsGlyph size={16} />
                </span>
                <span className="min-w-0 flex-1 text-sm text-ink break-words">{goal.text}</span>
                <GripHorizontalIcon size={14} strokeWidth={1.8} className="shrink-0 text-ink-dim opacity-60" />
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => void removeGoal(goal.id)}
                  aria-label={`Delete goal: ${goal.text}`}
                  className={cn(
                    "flex-shrink-0 rounded-[6px] p-1.5",
                    "text-ink-dim hover:text-error hover:bg-error-muted",
                    "opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                  )}
                >
                  <TrashIcon size={13} strokeWidth={1.8} />
                </button>
              </Reorder.Item>
            ))}
          </Reorder.Group>
        )}
          </>
        )}
      </div>
    </div>
  );
}

function PriorityChips({
  value,
  onChange,
  groupLabel,
}: {
  value: "p1" | "p2" | "p3" | undefined;
  onChange: (value: "p1" | "p2" | "p3" | undefined) => void;
  groupLabel: string;
}) {
  return (
    <div className="flex gap-1.5" role="group" aria-label={groupLabel}>
      {(["p1", "p2", "p3"] as const).map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? undefined : p)}
            className="rounded-[6px] px-2.5 py-1.5 text-xs"
            style={{
              border: `1px solid ${active ? "var(--color-accent-primary)" : "var(--color-border-default)"}`,
              background: active ? "var(--color-accent-dim)" : "var(--color-bg-elevated)",
              color: active ? "var(--color-accent-primary)" : "var(--color-text-muted)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {p.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function GoalsEmptyState({
  serverBacked,
  showAddPill,
  onAddClick,
}: {
  serverBacked: boolean;
  showAddPill: boolean;
  onAddClick: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, ease: EASE_OUT_EXPO }}
      className="flex flex-col items-center py-14 text-center"
    >
      <span
        aria-hidden
        className="grid h-14 w-14 place-items-center rounded-full border border-line-subtle bg-[var(--color-bg-surface)] text-ink-soft"
      >
        <NavGoalsGlyph size={26} />
      </span>
      <p className="mt-4 text-xl font-semibold tracking-[-0.02em] text-ink">No goals yet.</p>
      <p className="mt-1.5 text-[13px] text-ink-soft">
        {serverBacked ? "Choose one outcome you want to move." : "Add one above, then drag to reorder."}
      </p>
      {showAddPill && (
        <button
          type="button"
          onClick={onAddClick}
          className="mt-5 rounded-[10px] bg-accent px-5 py-2.5 text-[13px] font-semibold text-canvas transition-opacity hover:opacity-90"
        >
          Add goal
        </button>
      )}
    </motion.div>
  );
}
