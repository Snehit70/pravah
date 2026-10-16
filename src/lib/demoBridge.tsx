// Bridges the single convex/react import surface (src/lib/data.ts) to either
// the real client or the demo hooks. The choice is made once, before React
// mounts: main.tsx installs the demo module when the flag is set, so the impl
// never flips mid-render. In production and in tests the real module (or its
// vi.mock stand-in) flows straight through.
/* eslint-disable react-refresh/only-export-components -- shim module, not a component file */
/* eslint-disable @typescript-eslint/no-explicit-any -- untyped boundary between real and demo modules */
import type { ComponentType, ReactNode } from "react";
import * as real from "convex/react";

// The narrow surface the app actually consumes, kept loose so both the real
// generic hooks and the demo shims satisfy it.
export interface ConvexSurface {
  Authenticated: ComponentType<{ children?: ReactNode }>;
  AuthLoading: ComponentType<{ children?: ReactNode }>;
  Unauthenticated: ComponentType<{ children?: ReactNode }>;
  useConvexAuth: () => { isAuthenticated: boolean; isLoading: boolean };
  useConvexConnectionState: () => {
    isWebSocketConnected: boolean;
    hasInflightRequests: boolean;
    connectionCount: number;
  };
  usePaginatedQuery: (ref: never, ...rest: never[]) => unknown;
  useQuery: (ref: never, ...rest: never[]) => unknown;
  useMutation: (ref: never) => (...args: never[]) => Promise<unknown>;
  useAction: (ref: never) => (...args: never[]) => Promise<unknown>;
}

let demoImpl: ConvexSurface | null = null;

export function setDemoImpl(implSurface: ConvexSurface): void {
  demoImpl = implSurface;
}

function impl(): ConvexSurface {
  return demoImpl ?? (real as unknown as ConvexSurface);
}

function render(name: keyof ConvexSurface, props: Record<string, unknown>): ReactNode {
  const Component = impl()[name] as ComponentType<any>;
  return <Component {...props} />;
}

export function Authenticated(props: { children?: ReactNode }) {
  return render("Authenticated", props);
}

export function AuthLoading(props: { children?: ReactNode }) {
  return render("AuthLoading", props);
}

export function Unauthenticated(props: { children?: ReactNode }) {
  return render("Unauthenticated", props);
}

export function useConvexAuth() {
  return impl().useConvexAuth();
}

export function useConvexConnectionState() {
  return impl().useConvexConnectionState();
}

export const useQuery = ((ref: unknown, ...rest: unknown[]) =>
  (impl().useQuery as (...args: unknown[]) => unknown)(ref, ...rest)) as typeof real.useQuery;

export const useMutation = ((ref: unknown) =>
  (impl().useMutation as (ref: unknown) => (...args: unknown[]) => Promise<unknown>)(ref)) as unknown as typeof real.useMutation;

export const useAction = ((ref: unknown) =>
  (impl().useAction as (ref: unknown) => (...args: unknown[]) => Promise<unknown>)(ref)) as unknown as typeof real.useAction;

export const usePaginatedQuery = ((ref: unknown, ...rest: unknown[]) =>
  (impl().usePaginatedQuery as (...args: unknown[]) => unknown)(ref, ...rest)) as typeof real.usePaginatedQuery;
