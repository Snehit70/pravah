import { useCallback, useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { authClient, hasCachedAuthSessionHint } from "../lib/auth-client";
import { classifyError, mobileLogger } from "../lib/logger";
import type { MobileTask } from "../components/TaskCard";
import type { TabKey } from "../components/BottomTabBar";

export type ToastAction = { label: string; run: () => void };

export type ToastState = {
  kind: "error" | "info";
  message: string;
  /** Optional inline action, e.g. "Undo" after a swipe. */
  action?: ToastAction;
};

export function useWorkspaceState() {
  const [activeTab, setActiveTab] = useState<TabKey>("inbox");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [optimisticTasks, setOptimisticTasks] = useState<MobileTask[] | null>(null);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isKairoActive, setIsKairoActive] = useState(false);
  const [bootstrapReadyInternal, setBootstrapReadyInternal] = useState(false);
  const [bootstrapErrorInternal, setBootstrapErrorInternal] = useState<string | null>(null);
  const [bootstrapRetryNonce, setBootstrapRetryNonce] = useState(0);

  const sessionResult = authClient.useSession();
  const session = sessionResult.data;
  const sessionLoading = sessionResult.isPending;
  const hasCachedSessionHint = hasCachedAuthSessionHint();

  const storeUserMutation = useMutation(api.users.store);
  const claimLegacyDataMutation = useMutation(api.users.claimLegacyData);

  const showToast = useCallback((next: ToastState) => setToast(next), []);
  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return;
    // Undo toasts linger a little longer so the action stays reachable.
    const timeout = setTimeout(() => setToast(null), toast.action ? 5000 : 3200);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (pendingMutations !== 0) return;
    queueMicrotask(() => setOptimisticTasks(null));
  }, [pendingMutations]);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    void (async () => {
      try {
        if (!cancelled) {
          setBootstrapReadyInternal(false);
          setBootstrapErrorInternal(null);
        }
        mobileLogger.info("bootstrap_start", { attempt: bootstrapRetryNonce + 1 });
        await storeUserMutation({});
        mobileLogger.info("bootstrap_store_user_done");
        await claimLegacyDataMutation({});
        mobileLogger.info("bootstrap_claim_legacy_done");
        if (!cancelled) {
          setBootstrapErrorInternal(null);
          setBootstrapReadyInternal(true);
          mobileLogger.info("bootstrap_ready");
        }
      } catch (error) {
        const message = "Could not finish loading your workspace.";
        mobileLogger.warn("data_bootstrap_failed", {
          errorType: classifyError(error),
          attempt: bootstrapRetryNonce + 1,
        });
        showToast({
          kind: "error",
          message,
        });
        if (!cancelled) {
          setBootstrapReadyInternal(false);
          setBootstrapErrorInternal(message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, storeUserMutation, claimLegacyDataMutation, showToast, bootstrapRetryNonce]);

  const isDataBootstrapReady = session ? bootstrapReadyInternal : false;
  const bootstrapError = session ? bootstrapErrorInternal : null;
  const effectiveOptimisticTasks = pendingMutations === 0 ? null : optimisticTasks;

  const retryBootstrap = useCallback(() => {
    if (!session) return;
    setBootstrapReadyInternal(false);
    setBootstrapErrorInternal(null);
    setBootstrapRetryNonce((n) => n + 1);
  }, [session]);

  return {
    session,
    sessionLoading,
    activeTab,
    setActiveTab,
    isRefreshing,
    setIsRefreshing,
    pendingMutations,
    setPendingMutations,
    toast,
    showToast,
    dismissToast,
    optimisticTasks: effectiveOptimisticTasks,
    setOptimisticTasks,
    isAddSheetOpen,
    setIsAddSheetOpen,
    isEditSheetOpen,
    setIsEditSheetOpen,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    isKairoActive,
    setIsKairoActive,
    isDataBootstrapReady,
    bootstrapError,
    retryBootstrap,
    hasCachedSessionHint,
  };
}
