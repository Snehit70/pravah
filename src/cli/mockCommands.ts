import { readOption } from "./args";
import {
  getWriteMetadata,
  readGoalCreateOptions,
  readGoalUpdateOptions,
  readOperationListOptions,
  readOperationUndoOptions,
  readReviewListOptions,
  readSearchOptions,
  readTaskAddOptions,
  readTaskListFilters,
  readTaskUpdateOptions,
  requireOption,
} from "./commandUtils";
import {
  mockCredential,
  mockGoalLinks,
  mockGoals,
  mockReviewQueue,
  mockSyncStatus,
  mockTasks,
} from "./mockData";
import type { MockTask, ParsedArgs } from "./types";

function findTask(taskId: string): MockTask {
  const task = mockTasks.find((entry) => entry.id === taskId);
  if (!task) {
    throw new Error(`Task not found: ${taskId}`);
  }
  return task;
}

function buildTaskAction(action: string, taskId: string, args: ParsedArgs) {
  const task = findTask(taskId);
  return {
    action,
    task: { id: task.id, title: task.title },
    ...getWriteMetadata(args),
    source: "mock",
  };
}

function textMatchesQuery(query: string, ...values: Array<string | undefined>) {
  return values.some((value) => value?.toLowerCase().includes(query));
}

export function executeMockCommand(command: string, args: ParsedArgs) {
  switch (command) {
    case "tasks list": {
      const { status, date } = readTaskListFilters(args);
      return {
        tasks: mockTasks.filter(
          (task) =>
            (!status || task.status === status) &&
            (!date || task.deadline === date)
        ),
        source: "mock",
      };
    }
    case "tasks get": {
      const task = findTask(requireOption(args, "task-id", command));
      return { task, source: "mock" };
    }
    case "tasks search": {
      const { query, limit } = readSearchOptions(args, command);
      const { status } = readTaskListFilters(args);
      return {
        tasks: mockTasks
          .filter(
            (task) =>
              (!status || task.status === status) &&
              textMatchesQuery(query, task.title, task.description)
          )
          .slice(0, limit),
        query,
        limit,
        source: "mock",
      };
    }
    case "tasks inbox":
      return {
        tasks: mockTasks.filter((task) => task.status === "inbox"),
        source: "mock",
      };
    case "goals list":
      return {
        goals: mockGoals,
        links: mockGoalLinks,
        source: "mock",
      };
    case "goals get": {
      const goalId = requireOption(args, "goal-id", command);
      const goal = mockGoals.find((entry) => entry.id === goalId);
      if (!goal) {
        throw new Error(`Goal not found: ${goalId}`);
      }
      return { goal, source: "mock" };
    }
    case "goals search": {
      const { query, limit } = readSearchOptions(args, command);
      return {
        goals: mockGoals
          .filter((goal) => textMatchesQuery(query, goal.text, goal.description))
          .slice(0, limit),
        query,
        limit,
        source: "mock",
      };
    }
    case "goals update":
      return {
        action: "goals.update",
        goal: { id: requireOption(args, "goal-id", command) },
        ...readGoalUpdateOptions(args),
        ...getWriteMetadata(args),
        source: "mock",
      };
    case "goals create": {
      const goal = readGoalCreateOptions(args, command);
      return {
        action: "goals.create",
        goal: {
          id: goal.clientId ?? "mock_goal_new",
          text: goal.text,
        },
        ...goal,
        ...getWriteMetadata(args),
        operationId: "op_mock_goal_create",
        undoAvailable: true,
        source: "mock",
      };
    }
    case "goals delete":
      return {
        action: "goals.delete",
        goal: { id: requireOption(args, "goal-id", command) },
        ...getWriteMetadata(args),
        operationId: "op_mock_goal_delete",
        undoAvailable: true,
        source: "mock",
      };
    case "tasks timeline": {
      const endDate = requireOption(args, "end-date", command);
      const timeline: Record<string, typeof mockTasks> = {};
      for (const task of mockTasks) {
        if (task.status !== "timeline" || !task.deadline || task.deadline > endDate) {
          continue;
        }
        timeline[task.deadline] ??= [];
        timeline[task.deadline].push(task);
      }
      return {
        endDate,
        timeline,
        source: "mock",
      };
    }
    case "tasks add":
      {
        const task = readTaskAddOptions(args, command);
      return {
        action: "tasks.add",
        ...task,
        createdTaskId: "mock_task_new",
        ...getWriteMetadata(args),
        source: "mock",
      };
      }
    case "tasks move":
      return {
        ...buildTaskAction(
          "tasks.move",
          requireOption(args, "task-id", command),
          args
        ),
        targetDate: requireOption(args, "target-date", command),
      };
    case "tasks update":
      findTask(requireOption(args, "task-id", command));
      return {
        action: "tasks.update",
        ...readTaskUpdateOptions(args, command),
        ...getWriteMetadata(args),
        source: "mock",
      };
    case "tasks delete":
      return {
        ...buildTaskAction(
          "tasks.delete",
          requireOption(args, "task-id", command),
          args
        ),
        operationId: "op_mock_task_delete",
        undoAvailable: true,
      };
    case "tasks link-goal":
      return {
        action: "tasks.linkGoal",
        task: { id: requireOption(args, "task-id", command) },
        goal: { id: requireOption(args, "goal-id", command) },
        ...getWriteMetadata(args),
        operationId: "op_mock_link_goal",
        undoAvailable: true,
        source: "mock",
      };
    case "tasks unlink-goal":
      return {
        action: "tasks.unlinkGoal",
        task: { id: requireOption(args, "task-id", command) },
        ...getWriteMetadata(args),
        operationId: "op_mock_unlink_goal",
        undoAvailable: true,
        source: "mock",
      };
    case "tasks complete":
      return buildTaskAction(
        "tasks.complete",
        requireOption(args, "task-id", command),
        args
      );
    case "tasks reopen":
      return buildTaskAction(
        "tasks.reopen",
        requireOption(args, "task-id", command),
        args
      );
    case "tasks unschedule":
      return buildTaskAction(
        "tasks.unschedule",
        requireOption(args, "task-id", command),
        args
      );
    case "review list": {
      const { status, limit } = readReviewListOptions(args);
      const items = mockReviewQueue.filter((item) => !status || item.status === status);
      return { items: limit ? items.slice(0, limit) : items, source: "mock" };
    }
    case "sync status":
      return {
        ...mockSyncStatus,
        provider: readOption(args.options, "provider") ?? mockSyncStatus.provider,
        source: "mock",
      };
    case "operations list": {
      const options = readOperationListOptions(args);
      return {
        operations: [
          {
            operationId: "op_mock_1",
            operationGroupId: options.operationGroupId,
            operation: "tasks.add",
            status: "applied",
            undoAvailable: true,
          },
        ],
        ...options,
        source: "mock",
      };
    }
    case "operations get":
      return {
        operation: {
          operationId: requireOption(args, "operation-id", command),
          operation: "tasks.add",
          status: "applied",
          undoAvailable: true,
        },
        source: "mock",
      };
    case "operations undo":
      return {
        action: "operations.undo",
        ...readOperationUndoOptions(args),
        ...getWriteMetadata(args),
        result: { undone: [readOption(args.options, "operation-id") ?? "op_mock_1"] },
        source: "mock",
      };
    case "agent context":
      return {
        today: "2026-06-04",
        timeline: mockTasks
          .filter((task) => task.status === "timeline")
          .map((task) => ({
            id: task.id,
            title: task.title,
            deadline: task.deadline,
          })),
        inboxSummary: {
          count: mockTasks.filter((task) => task.status === "inbox").length,
        },
        goals: mockGoals,
        goalLinksSummary: {
          count: Object.keys(mockGoalLinks).length,
        },
        overdueSummary: {
          count: mockTasks.filter(
            (task) =>
              task.status === "timeline" &&
              task.deadline &&
              task.deadline < "2026-06-04"
          ).length,
        },
        reviewQueueSummary: { count: mockReviewQueue.length },
        syncStatusSummary: {
          provider: mockSyncStatus.provider,
          healthy: mockSyncStatus.healthy,
          lastRunAt: mockSyncStatus.lastRunAt,
        },
        automation: {
          credentialLabel: mockCredential.credentialLabel,
          scopes: mockCredential.scopes,
          kairoAllowedWrites: [
            "tasks.add",
            "tasks.update",
            "tasks.move",
            "tasks.complete",
            "tasks.reopen",
            "tasks.unschedule",
          ],
        },
        source: "mock",
      };
    case "agent task": {
      const task = findTask(requireOption(args, "task-id", command));
      const goalId = task.goal?.id;
      return {
        task,
        goal: goalId ? mockGoals.find((goal) => goal.id === goalId) ?? null : null,
        neighbors: task.deadline
          ? mockTasks
              .filter(
                (candidate) =>
                  candidate.id !== task.id &&
                  candidate.deadline === task.deadline
              )
              .map((neighbor) => ({
                id: neighbor.id,
                title: neighbor.title,
                status: neighbor.status,
              }))
          : [],
        source: "mock",
      };
    }
    default:
      throw new Error(`Unknown command: ${command}`);
  }
}
