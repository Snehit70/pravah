import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { authClient, hasCachedAuthSessionHint } from "../lib/auth-client";
import { classifyError, mobileLogger } from "../lib/logger";
import type { MobileTask } from "../components/TaskCard";
import type { TabKey } from "../components/BottomTabBar";

type ToastState = {
  kind: "error" | "info";
  message: string;
};

export function useWorkspaceState() {
  const appStartMsRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<TabKey>("inbox");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingMutations, setPendingMutations] = useState(0);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [optimisticTasks, setOptimisticTasks] = useState<MobileTask[] | null>(null);
  const [isAddSheetOpen, setIsAddSheetOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isKairoActive, setIsKairoActive] = useState(false);
  const [isDataBootstrapReady, setIsDataBootstrapReady] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [bootstrapRetryNonce, setBootstrapRetryNonce] = useState(0);

  const sessionResult = authClient.useSession();
  const session = sessionResult.data;
  const sessionLoading = sessionResult.isPending;
  const hasCachedSessionHint = hasCachedAuthSessionHint();

  const storeUserMutation = useMutation(api.users.store);
  const claimLegacyDataMutation = useMutation(api.users.claimLegacyData);

  const showToast = useCallback((next: ToastState) => setToast(next), []);

  useEffect(() => {
    if (appStartMsRef.current == null) {
      appStartMsRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (pendingMutations === 0) setOptimisticTasks(null);
  }, [pendingMutations]);

  useEffect(() => {
    if (!session) return;
    const startedAt = appStartMsRef.current ?? Date.now();
    mobileLogger.info("session_ready", {
      elapsedMs: Date.now() - startedAt,
    });
  }, [session]);

  useEffect(() => {
    if (!session) {
      setIsDataBootstrapReady(false);
      setBootstrapError(null);
      return;
    }

    let cancelled = false;
    setIsDataBootstrapReady(false);
    setBootstrapError(null);

    void (async () => {
      try {
        mobileLogger.info("bootstrap_start", { attempt: bootstrapRetryNonce + 1 });
        await storeUserMutation({});
        mobileLogger.info("bootstrap_store_user_done");
        await claimLegacyDataMutation({});
        mobileLogger.info("bootstrap_claim_legacy_done");
        if (!cancelled) {
          setIsDataBootstrapReady(true);
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
          setIsDataBootstrapReady(false);
          setBootstrapError(message);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, storeUserMutation, claimLegacyDataMutation, showToast, bootstrapRetryNonce]);

  const retryBootstrap = useCallback(() => {
    if (!session) return;
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
    optimisticTasks,
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
