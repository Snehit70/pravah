import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { getFunctionName } from "convex/server";

const today = new Date();
const date = (offset) => {
  const value = new Date(today);
  value.setDate(value.getDate() + offset);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};
const now = Date.now();
let tasks = Array.from({ length: 500 }, (_, index) => ({
  _id: `fixture-task-${index}`, title: `Fixture task ${String(index).padStart(3, "0")}`,
  description: "Deterministic native workflow fixture", priority: "p1",
  createdAt: now, updatedAt: now, scheduledAt: now, position: index,
  ...(index >= 300 && index < 450 ? { deadline: date(index % 3) } : {}),
  ...(index >= 450 ? { deadline: date(-1), completedAt: now - 60_000 } : {}),
}));
let goals = [{ id: "fixture-goal", text: "Native workflow goal", createdAt: now }];
let links = { "fixture-task-300": "fixture-goal" };
let revision = 0;
const listeners = new Set();
const subscribe = (listener) => { listeners.add(listener); return () => listeners.delete(listener); };
const snapshot = () => revision;
const emit = () => { revision += 1; listeners.forEach((listener) => listener()); };
const active = (task) => task.completedAt === undefined && task.cancelledAt === undefined;
const idempotentResults = new Map();

function query(name, args = {}) {
  switch (name) {
    case "tasks:listTasks": return tasks.filter((task) => {
      if (args.status === "inbox") return active(task) && !task.deadline;
      if (args.status === "completed") return task.completedAt !== undefined && (!args.date || task.deadline === args.date);
      return active(task);
    });
    case "tasks:getTimeline": return tasks.filter((task) => active(task) && task.deadline && task.deadline <= args.endDate)
      .reduce((days, task) => { (days[task.deadline] ??= []).push(task); return days; }, {});
    case "goals:list": return goals;
    case "goals:listLinks": return links;
    case "goals:listTasks": return tasks.filter((task) => links[task._id] === args.goalClientId);
    case "goalProgress:list": return { ready: true, progress: Object.fromEntries(goals.map((goal) => {
      const linked = tasks.filter((task) => links[task._id] === goal.id);
      return [goal.id, { total: linked.length, done: linked.filter((task) => task.completedAt !== undefined).length }];
    })) };
    case "taskImages:listWorkspaceImageCollections": return [];
    case "taskImages:getTaskImageCollection": return { revision: 0, active: [], recoverable: [] };
    case "taskImageBudget:getOwnerBudgetStatus": return { warning: false, grantsBlocked: false };
    case "mobileReleases:getState": return null;
    case "mobileReleases:listPublished":
    case "automation:listCredentials":
    case "automation:listBootstrapTokens": return [];
    case "sync:getIntegrationStatus": return { integration: null, pendingReviewCount: 0 };
    default: throw new Error(`Missing native fixture query: ${name}`);
  }
}

async function mutate(name, args = {}) {
  switch (name) {
    case "users:store":
    case "users:claimLegacyData":
    case "goalProgress:prepare": return null;
    case "tasks:addTask": {
      if (args.idempotencyKey && idempotentResults.has(args.idempotencyKey)) return idempotentResults.get(args.idempotencyKey);
      const id = `fixture-added-${tasks.length}`;
      tasks = [{ ...args, _id: id, createdAt: Date.now(), updatedAt: Date.now(), scheduledAt: Date.now(), position: -tasks.length }, ...tasks];
      if (args.idempotencyKey) idempotentResults.set(args.idempotencyKey, id);
      emit(); return id;
    }
    case "tasks:updateTask":
    case "tasks:completeTask":
    case "tasks:reopenTask":
    case "tasks:moveTask":
    case "tasks:unscheduleTask":
    case "tasks:softDeleteTask":
    case "tasks:restoreTask": {
      tasks = tasks.map((task) => task._id !== args.taskId ? task : {
        ...task, ...(name === "tasks:updateTask" ? {
          ...args,
          deadline: args.deadline === null ? undefined : args.deadline,
          time: args.time === null ? undefined : args.time,
        } : {}), updatedAt: Date.now(),
        ...(name === "tasks:completeTask" ? { completedAt: Date.now() } : {}),
        ...(name === "tasks:reopenTask" ? { completedAt: undefined } : {}),
        ...(name === "tasks:moveTask" ? { deadline: args.targetDate } : {}),
        ...(name === "tasks:unscheduleTask" ? { deadline: undefined, time: undefined } : {}),
        ...(name === "tasks:softDeleteTask" ? { cancelledAt: Date.now() } : {}),
        ...(name === "tasks:restoreTask" ? { cancelledAt: undefined } : {}),
      }); emit(); return null;
    }
    case "goals:upsert": {
      goals = [...goals.filter((goal) => goal.id !== args.clientId), { ...args, id: args.clientId }]; emit(); return args.clientId;
    }
    case "goals:setLink": links = { ...links, [args.taskId]: args.goalClientId }; emit(); return null;
    default: throw new Error(`Missing native fixture mutation: ${name}`);
  }
}

export function useQuery(reference, args = {}) {
  const version = useSyncExternalStore(subscribe, snapshot);
  const name = getFunctionName(reference);
  const key = JSON.stringify(args);
  return useMemo(() => key === '"skip"' ? undefined : query(name, JSON.parse(key)), [version, name, key]);
}
export function useMutation(reference) {
  const name = getFunctionName(reference);
  return useCallback((args) => mutate(name, args), [name]);
}
export function useAction(reference) {
  const name = getFunctionName(reference);
  return useCallback(async () => { throw new Error(`Native fixture forbids remote action: ${name}`); }, [name]);
}
export function usePaginatedQuery(reference, args, options) {
  const rows = useQuery(reference, args);
  const [count, setCount] = useState(options.initialNumItems);
  return { results: (rows ?? []).slice(0, count), status: (rows?.length ?? 0) > count ? "CanLoadMore" : "Exhausted",
    loadMore: (more) => setCount((current) => current + more) };
}
const client = { query: async (reference, args) => query(getFunctionName(reference), args) };
export function useConvex() { return client; }
