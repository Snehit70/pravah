import type { RetryQueueItem } from "../hooks/useRetryQueue";

export const MAX_RETRY_QUEUE_PERSIST = 20;

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
    );
  } catch {
    return [];
  }
}

export function prepareRetryQueueForPersist(queue: RetryQueueItem[]): RetryQueueItem[] {
  return queue.slice(-MAX_RETRY_QUEUE_PERSIST);
}
