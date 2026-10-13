type Token = { token: string; expiresAt: number };

/** Keep the SDK's forced refresh pending until renewal succeeds or is cancelled. */
export function createWatchAuth<T extends Token>({
  initialToken, mint, isRevoked, onRevoked, onRetry, onRenewed, now = Date.now,
}: {
  initialToken: T;
  mint: (signal: AbortSignal) => Promise<T>;
  isRevoked: (error: unknown) => boolean;
  onRevoked: (error: unknown) => void;
  onRetry: (delayMs: number) => void;
  onRenewed: () => void;
  now?: () => number;
}) {
  let current = initialToken;
  let pending: Promise<string | null> | undefined;
  const controller = new AbortController();

  const wait = (delayMs: number) => new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, delayMs);
    controller.signal.addEventListener("abort", finish, { once: true });
    if (controller.signal.aborted) finish();
  });

  const renew = async (): Promise<string | null> => {
    let failures = 0;
    while (!controller.signal.aborted) {
      try {
        const next = await mint(controller.signal);
        if (controller.signal.aborted) return null;
        if (!Number.isFinite(next.expiresAt) || next.expiresAt <= now() || !next.token) {
          throw new Error("Renewed watcher token is expired or invalid");
        }
        // JWTs minted in the same second can be identical. Convex interprets
        // returning the previous token as opting out of further renewal.
        if (next.token === current.token) {
          throw new Error("Watcher token has not changed yet");
        }
        current = next;
        onRenewed();
        return current.token;
      } catch (error) {
        if (controller.signal.aborted) return null;
        if (isRevoked(error)) {
          controller.abort();
          onRevoked(error);
          return null;
        }
        const delayMs = Math.min(30_000, 1000 * 2 ** Math.min(failures++, 5));
        onRetry(delayMs);
        await wait(delayMs);
      }
    }
    return null;
  };

  return {
    fetchToken({ forceRefreshToken = false } = {}): Promise<string | null> {
      if (controller.signal.aborted) return Promise.resolve(null);
      if (pending) return pending;
      if (!forceRefreshToken && current.expiresAt - 60_000 > now()) return Promise.resolve(current.token);
      pending = renew().finally(() => { pending = undefined; });
      return pending;
    },
    close() { controller.abort(); },
  };
}
