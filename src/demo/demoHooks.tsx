// Demo-mode drop-ins for the convex/react surface the web app consumes.
// Signatures mirror the real hooks so call sites need no changes.
/* eslint-disable react-refresh/only-export-components -- shim module, not a component file */

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import * as store from "./store";

const FUNCTION_NAME = Symbol.for("functionName");

function functionName(ref: unknown): string {
  const name = (ref as Record<symbol, unknown> | null)?.[FUNCTION_NAME];
  if (typeof name !== "string") {
    throw new Error("demo: expected a Convex function reference");
  }
  return name;
}

export function Authenticated({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function AuthLoading() {
  return null;
}

export function Unauthenticated() {
  return null;
}

export function useConvexAuth(): { isAuthenticated: boolean; isLoading: boolean } {
  return { isAuthenticated: true, isLoading: false };
}

export function useConvexConnectionState(): {
  isWebSocketConnected: boolean;
  hasInflightRequests: boolean;
  connectionCount: number;
} {
  return { isWebSocketConnected: true, hasInflightRequests: false, connectionCount: 1 };
}

export function useQuery(ref: unknown, ...rest: unknown[]): unknown {
  const skipped = rest[0] === "skip";
  const args = skipped ? {} : (rest[0] ?? {});
  const name = functionName(ref);
  const getSnapshot = () => (skipped ? undefined : store.snapshot(name, args));
  const getServerSnapshot = () => (skipped ? undefined : store.snapshot(name, args));
  return useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
}

export function useMutation(ref: unknown): (args: unknown) => Promise<unknown> {
  const name = functionName(ref);
  return useCallback(
    async (args: unknown) => store.dispatch(name, args),
    [name]
  );
}

export function useAction(ref: unknown): (args: unknown) => Promise<unknown> {
  const name = functionName(ref);
  return useCallback(
    async (args: unknown) => store.dispatch(name, args),
    [name]
  );
}

// The real ConvexReactClient opens a websocket; demo mode must never touch the
// network, so this stub only satisfies the constructor call site.
export class ConvexReactClient {
  constructor(_address?: string, _options?: unknown) {}
}

export function usePaginatedQuery(ref: unknown, args: Record<string, unknown>, options: { initialNumItems: number }) {
  const [count, setCount] = useState(options.initialNumItems);
  const name = functionName(ref);
  const getSnapshot = () => store.snapshot(name, { ...args, paginationOpts: { cursor: null, numItems: count } });
  const result = useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot) as { page: unknown[]; isDone: boolean };
  return {
    results: result.page,
    status: result.isDone ? "Exhausted" : "CanLoadMore",
    loadMore: (amount: number) => setCount((current) => current + amount),
  };
}
