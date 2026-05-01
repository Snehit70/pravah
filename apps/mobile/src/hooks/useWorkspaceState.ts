import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { authClient } from "../lib/auth-client";
import { classifyError, mobileLogger } from "../lib/logger";
import type { MobileTask } from "../components/TaskCard";
import type { TabKey } from "../components/BottomTabBar";

type ToastState = {
  kind: "error" | "info";
  message: string;
};

export function useWorkspaceState() {
  const appStartMsRef = useRef<number>(Date.now());

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

  const sessionResult = authClient.useSession();
  const session = sessionResult.data;
  const sessionLoading = sessionResult.isPending;

  const storeUserMutation = useMutation(api.users.store);
  const claimLegacyDataMutation = useMutation(api.users.claimLegacyData);

  const showToast = useCallback((next: ToastState) => setToast(next), []);

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
    mobileLogger.info("session_ready", {
      elapsedMs: Date.now() - appStartMsRef.current,
    });
  }, [session]);

  useEffect(() => {
    if (!session) {
      setIsDataBootstrapReady(false);
      return;
    }

    let cancelled = false;
    setIsDataBootstrapReady(false);

    void (async () => {
      try {
        await storeUserMutation({});
        await claimLegacyDataMutation({});
      } catch (error) {
        mobileLogger.warn("data_bootstrap_failed", {
          errorType: classifyError(error),
        });
        showToast({
          kind: "error",
          message: "Could not finish loading your workspace.",
        });
      } finally {
        if (!cancelled) {
          setIsDataBootstrapReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [session, storeUserMutation, claimLegacyDataMutation, showToast]);

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
  };
}
