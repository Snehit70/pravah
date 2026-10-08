import { mutation as rawMutation, internalMutation as rawInternalMutation } from "./_generated/server";
import type { DataModel } from "./_generated/dataModel";
import { Triggers } from "convex-helpers/server/triggers";
import { customCtx, customMutation } from "convex-helpers/server/customFunctions";
import { syncGoalProgress } from "./goalProgressModel";

const triggers = new Triggers<DataModel>();
triggers.register("tasks", async (ctx, change) => {
  // Text, ordering, image revisions and rescheduling do not affect progress.
  const previous = change.oldDoc;
  const next = change.newDoc;
  if (previous && next && previous.ownerTokenIdentifier === next.ownerTokenIdentifier &&
      previous.completedAt === next.completedAt && previous.cancelledAt === next.cancelledAt &&
      previous.status === next.status) return;
  for (const owner of new Set([previous?.ownerTokenIdentifier, next?.ownerTokenIdentifier])) {
    if (owner) await syncGoalProgress(ctx, owner, String(change.id));
  }
});
triggers.register("goalLinks", async (ctx, change) => {
  const keys = new Map([change.oldDoc, change.newDoc].filter(doc => doc !== null)
    .map(doc => [`${doc.ownerTokenIdentifier}\0${doc.taskId}`, doc]));
  for (const doc of keys.values()) await syncGoalProgress(ctx, doc.ownerTokenIdentifier, doc.taskId);
});
export const mutation = customMutation(rawMutation, customCtx(triggers.wrapDB));
export const internalMutation = customMutation(rawInternalMutation, customCtx(triggers.wrapDB));
