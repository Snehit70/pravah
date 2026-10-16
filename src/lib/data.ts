// Single import surface for the Convex client hooks used across the app.
// Named exports from ./demoBridge override the star re-export, letting demo
// mode swap the implementation without touching any call sites.
export * from "convex/react";
export {
  Authenticated,
  AuthLoading,
  Unauthenticated,
  useConvexAuth,
  useConvexConnectionState,
  useQuery,
  usePaginatedQuery,
  useMutation,
  useAction,
} from "./demoBridge";
