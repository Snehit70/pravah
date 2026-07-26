import { Component, type ErrorInfo, type ReactNode } from "react";

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("pravah_web_render_failed", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#05070d] px-6 text-zinc-100">
          <section className="w-full max-w-md rounded-lg border border-white/10 bg-white/[0.04] p-6 shadow-2xl">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-zinc-500">
              Pravah web
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight">
              Pravah could not load
            </h1>
            <p className="mt-3 text-sm leading-6 text-zinc-400">
              The app hit an unexpected browser error. Reload the page to try again.
            </p>
            <button
              type="button"
              className="mt-6 rounded-md bg-white px-4 py-2 text-sm font-semibold text-[#090a0f] transition-colors hover:bg-zinc-200"
              onClick={() => window.location.reload()}
            >
              Reload Pravah
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
