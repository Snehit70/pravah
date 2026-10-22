import type { RetryQueueItem } from "../hooks/useRetryQueue";

export function hydrateRetryQueue(raw: string | null): RetryQueueItem[] {
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as RetryQueueItem[];
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item) =>
        typeof item?.id === "string" &&
        typeof item?.label === "string" &&
        typeof item?.attempts === "number" &&
        item?.payload !== undefined
    ).map((item) => item.payload.type === "addTask"
      ? { ...item, payload: { ...item.payload, idempotencyKey: item.payload.idempotencyKey ?? `mobile-retry:${item.id}` } }
      : item);
  } catch {
    return [];
  }
}

export function prepareRetryQueueForPersist(queue: RetryQueueItem[]): RetryQueueItem[] {
  // Every accepted pending operation must survive restart, including older
  // entries. A display/history cap must never truncate a durable outbox.
  return queue;
}
