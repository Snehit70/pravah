/**
 * ConfirmDialog
 *
 * In-theme replacement for `Alert.alert` confirmation prompts. Mounted once at
 * the app root via <ConfirmProvider/>, called from any descendant with:
 *
 *   const confirm = useConfirm();
 *   const ok = await confirm({ title: "Delete?", confirmLabel: "Delete", destructive: true });
 *
 * Returns true if the user tapped the confirm button, false if cancelled
 * (Cancel tap, backdrop tap, or hardware back on Android).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  BackHandler,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { useReducedMotion } from "../hooks/useReducedMotion";

export type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true the confirm button uses the destructive (error) tone. */
  destructive?: boolean;
};

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used inside <ConfirmProvider>");
  }
  return ctx;
}

type PendingState = {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
};

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);
  const reducedMotion = useReducedMotion();
  // Track the latest pending dialog so the Android back handler always
  // resolves the right promise, even if a new dialog has replaced it.
  const pendingRef = useRef<PendingState | null>(null);
  pendingRef.current = pending;

  const confirm = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      // If a prior dialog is somehow still open (shouldn't happen with normal
      // usage but cheap to guard), resolve it as cancelled before showing the
      // next one so its caller doesn't dangle.
      setPending((prev) => {
        if (prev) prev.resolve(false);
        return { options, resolve };
      });
    });
  }, []);

  const close = useCallback((value: boolean) => {
    setPending((prev) => {
      if (prev) prev.resolve(value);
      return null;
    });
  }, []);

  // Android hardware back = cancel. We attach a listener only while the dialog
  // is open and return true so the back event doesn't propagate to the screen.
  useEffect(() => {
    if (!pending) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      const current = pendingRef.current;
      if (!current) return false;
      close(false);
      return true;
    });
    return () => sub.remove();
  }, [pending, close]);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <Modal
        visible={pending !== null}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => close(false)}
      >
        {pending ? (
          <Animated.View
            entering={reducedMotion ? undefined : FadeIn.duration(140)}
            exiting={reducedMotion ? undefined : FadeOut.duration(120)}
            style={styles.backdrop}
          >
            <Pressable
              accessibilityLabel="Dismiss dialog"
              style={StyleSheet.absoluteFill}
              onPress={() => close(false)}
            />
            <View style={styles.card} accessibilityViewIsModal accessibilityRole="alert">
              <Text style={styles.title}>{pending.options.title}</Text>
              {pending.options.message ? (
                <Text style={styles.message}>{pending.options.message}</Text>
              ) : null}
              <View style={styles.actions}>
                <Pressable
                  onPress={() => close(false)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={pending.options.cancelLabel ?? "Cancel"}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    styles.cancelBtn,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={styles.cancelText}>
                    {pending.options.cancelLabel ?? "Cancel"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => close(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={pending.options.confirmLabel ?? "Confirm"}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    pending.options.destructive ? styles.destructiveBtn : styles.confirmBtn,
                    pressed && { opacity: 0.85 },
                  ]}
                >
                  <Text
                    style={
                      pending.options.destructive ? styles.destructiveText : styles.confirmText
                    }
                  >
                    {pending.options.confirmLabel ?? "Confirm"}
                  </Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
        ) : null}
      </Modal>
    </ConfirmContext.Provider>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: colors.bgFloating,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  message: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  actionBtn: {
    minHeight: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelBtn: {
    backgroundColor: "transparent",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cancelText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
  },
  confirmBtn: {
    backgroundColor: colors.accent,
  },
  confirmText: {
    ...typography.bodyMd,
    color: colors.bg,
    fontWeight: "600",
  },
  destructiveBtn: {
    backgroundColor: colors.error,
  },
  destructiveText: {
    ...typography.bodyMd,
    color: colors.bg,
    fontWeight: "600",
  },
});
