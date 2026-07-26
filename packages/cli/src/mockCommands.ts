import { hasFlag, readOption } from "./args";
import { getWriteMetadata, readTarget } from "./commandUtils";
import { getLocalDateString } from "./date";
import { mockGoalLinks, mockGoals, mockTasks } from "./mockData";
import type { MockTask, ParsedArgs } from "./types";

const priorities = { p1: 0, p2: 1, p3: 2 };
const split = (value?: string) => value?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
function taskTarget(target: string) { const matches = mockTasks.filter((task) => task.id === target || task.title === target); if (!matches.length) throw new Error(`Task not found: ${target}`); if (matches.length > 1) throw new Error(`Task target is ambiguous: ${matches.map((task) => `${task.title} (${task.id})`).join(", ")}`); return matches[0]; }
function goalTarget(target: string) { const matches = mockGoals.filter((goal) => goal.id === target || goal.text === target); if (!matches.length) throw new Error(`Goal not found: ${target}`); if (matches.length > 1) throw new Error(`Goal target is ambiguous: ${matches.map((goal) => `${goal.text} (${goal.id})`).join(", ")}`); return matches[0]; }
function enrich(task: MockTask) { const goalId = mockGoalLinks[task.id]; return { ...task, goal: goalId ? mockGoals.find((goal) => goal.id === goalId) ?? null : null }; }
function filteredTasks(args: ParsedArgs) {
  const status = readOption(args.options, "status"); const goal = readOption(args.options, "goal"); const ps = split(readOption(args.options, "priority")); const tags = split(readOption(args.options, "tag")); const date = readOption(args.options, "date"); const before = readOption(args.options, "before"); const after = readOption(args.options, "after");
  const goalId = goal ? goalTarget(goal).id : undefined;
  return mockTasks.filter((task) => {
    const active = task.status === "inbox" || task.status === "timeline";
    if (status === "active" ? !active : status && task.status !== status) return false;
    if (!status && !active) return false;
    if (goalId && mockGoalLinks[task.id] !== goalId) return false;
    if (ps.length && (!task.priority || !ps.includes(task.priority))) return false;
    if (tags.length && !(task.tags ?? []).some((tag) => tags.includes(tag))) return false;
    if (date && task.deadline !== date) return false;
    if (before && (!task.deadline || task.deadline >= before)) return false;
    if (after && (!task.deadline || task.deadline <= after)) return false;
    return true;
  }).map(enrich);
}
function horizon(tasks: ReturnType<typeof filteredTasks>) { const today = getLocalDateString(); const end = new Date(`${today}T12:00:00`); end.setDate(end.getDate() + 14); const until = getLocalDateString(end); const active = tasks.filter((task) => task.status === "inbox" || task.status === "timeline"); const overdue = active.filter((task) => task.deadline && task.deadline < today).sort((a,b) => priorities[a.priority ?? "p3"] - priorities[b.priority ?? "p3"] || a.deadline!.localeCompare(b.deadline!)); const todayTasks = active.filter((task) => task.deadline === today).sort((a,b) => (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || priorities[a.priority ?? "p3"] - priorities[b.priority ?? "p3"]); const upcoming = active.filter((task) => task.deadline && task.deadline > today && task.deadline <= until).sort((a,b) => `${a.deadline}${a.time ?? "99:99"}`.localeCompare(`${b.deadline}${b.time ?? "99:99"}`)); return { today, endDate: until, overdue, todayTasks, upcoming, inboxCount: active.filter((task) => task.status === "inbox").length }; }
function receipt(action: string, target: { id: string; title?: string }, args: ParsedArgs) { const metadata = getWriteMetadata(args); return { action, target, ...metadata, operation: { operationId: `op_mock_${action.replaceAll(".", "_")}`, undoAvailable: true, undoExpiresAt: "2026-06-04T13:00:00.000Z" }, source: "mock" }; }
function goals() { return mockGoals.map((goal) => { const linked = mockTasks.filter((task) => mockGoalLinks[task.id] === goal.id && task.status !== "cancelled"); return { ...goal, progress: { completed: linked.filter((task) => task.status === "completed").length, active: linked.filter((task) => task.status === "inbox" || task.status === "timeline" || task.status === "completed").length }, activeTasks: linked.filter((task) => task.status === "inbox" || task.status === "timeline").map(enrich) }; }).sort((a,b) => priorities[a.priority ?? "p3"] - priorities[b.priority ?? "p3"] || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.text.localeCompare(b.text)); }
export function executeMockCommand(command: string, args: ParsedArgs): unknown {
  if (["tasks list", "inbox", "today", "overdue", "upcoming"].includes(command)) { const tasks = filteredTasks(args); const data = horizon(tasks); if (command === "inbox") return { tasks: tasks.filter((task) => task.status === "inbox"), source: "mock" }; if (command === "today") return { tasks: data.todayTasks, today: data.today, source: "mock" }; if (command === "overdue") return { tasks: data.overdue, today: data.today, source: "mock" }; if (command === "upcoming") return { tasks: data.upcoming, today: data.today, endDate: data.endDate, source: "mock" }; if (hasFlag(args.options, "all") || readOption(args.options, "status")) return { tasks, source: "mock" }; return { ...data, source: "mock" }; }
  if (command === "tasks show") return { task: taskTarget(readTarget(args, command)), source: "mock" };
  if (command === "goals list") return { goals: goals(), source: "mock" };
  if (command === "goals show") { const goal = goals().find((item) => item.id === goalTarget(readTarget(args, command)).id)!; return { goal, historicalTaskCount: mockTasks.filter((task) => mockGoalLinks[task.id] === goal.id && !["inbox", "timeline"].includes(task.status)).length, source: "mock" }; }
  if (command === "agent context") { const data = horizon(filteredTasks(args)); const slim = (tasks: Array<{ id: string; title: string; deadline?: string; priority?: string; goal?: unknown }>) => tasks.slice(0, 3).map((task) => ({ id: task.id, title: task.title, deadline: task.deadline, priority: task.priority, goal: task.goal })); return { today: data.today, overdue: { count: data.overdue.length, tasks: slim(data.overdue) }, todayTasks: { count: data.todayTasks.length, tasks: slim(data.todayTasks) }, next: { count: data.upcoming.length, tasks: slim(data.upcoming) }, inbox: { count: data.inboxCount }, source: "mock" }; }
  if (command === "operations list") return { operations: [{ operationId: "op_mock_tasks_add", operation: "tasks.add", status: "applied", undoAvailable: true }], source: "mock" };
  if (command === "operations show") return { operation: { operationId: readTarget(args, command), operation: "tasks.add", status: "applied", undoAvailable: true }, source: "mock" };
  if (command === "operations undo") { const target = readOption(args.options, "group") ?? readTarget(args, command); return receipt("operations.undo", { id: target }, args); }
  if (command.startsWith("tasks ")) { const verb = command.slice(6); const target = verb === "add" ? { id: "task_mock_new", title: readTarget(args, command) } : taskTarget(readTarget(args, command)); if (verb === "remove" && !hasFlag(args.options, "confirm")) throw new Error("--confirm is required for tasks remove"); return receipt(`tasks.${verb}`, target, args); }
  if (command.startsWith("goals ")) { const verb = command.slice(6); const target = verb === "add" ? { id: "goal_mock_new", title: readTarget(args, command) } : goalTarget(readTarget(args, command)); if (verb === "remove" && !hasFlag(args.options, "confirm")) throw new Error("--confirm is required for goals remove"); return receipt(`goals.${verb}`, { id: target.id, title: "text" in target ? target.text : target.title }, args); }
  throw new Error(`Unknown command: ${command}`);
}
