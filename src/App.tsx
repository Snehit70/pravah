import { lazy, Suspense } from "react";
import { Authenticated, AuthLoading, Unauthenticated } from "convex/react";
import { LoadingSkeleton } from "./components/LoadingSkeleton";
import { AuthScreen } from "./components/AuthScreen";

const AuthenticatedApp = lazy(() =>
  import("./components/AuthenticatedApp").then((module) => ({
    default: module.AuthenticatedApp,
  }))
);

export function App() {
  return (
    <>
      <AuthLoading>
        <LoadingSkeleton />
      </AuthLoading>
      <Unauthenticated>
        <AuthScreen />
      </Unauthenticated>
      <Authenticated>
        <Suspense fallback={<LoadingSkeleton />}>
          <AuthenticatedApp />
        </Suspense>
      </Authenticated>
    </>
  );
}
