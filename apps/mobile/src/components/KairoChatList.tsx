/**
 * KairoChatList
 *
 * Inline panel rendered inside the Kairo bottom sheet when the user opens
 * the chat menu. Lists past chats (newest first), offers a "New chat" CTA,
 * and a destructive delete row gated behind a native confirm.
 */

import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import type { ChatMeta } from "../lib/kairoChatStorage";
import { formatRelative } from "../lib/formatRelative";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { useConfirm } from "../hooks/useConfirm";

type Props = {
  chats: ChatMeta[];
  activeChatId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onClose: () => void;
};

export function KairoChatList({
  chats,
  activeChatId,
  onSelect,
  onCreate,
  onDelete,
  onClose,
}: Props) {
  const confirm = useConfirm();
  const sorted = useMemo(
    () => [...chats].sort((a, b) => b.updatedAt - a.updatedAt),
    [chats]
  );

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityLabel="Back to chat"
          accessibilityRole="button"
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.headerBack}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Chats</Text>
        <Pressable
          onPress={onCreate}
          hitSlop={12}
          accessibilityLabel="Start new chat"
          accessibilityRole="button"
          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.headerAction}>+ New</Text>
        </Pressable>
      </View>

      <BottomSheetScrollView contentContainerStyle={styles.listContent}>
        {sorted.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>No chats yet.</Text>
            <Text style={styles.emptyText}>Start one from the current workspace and it will appear here.</Text>
            <Pressable
              onPress={onCreate}
              hitSlop={12}
              accessibilityLabel="Start first chat"
              accessibilityRole="button"
              style={({ pressed }) => [styles.emptyAction, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.emptyActionText}>New chat</Text>
            </Pressable>
          </View>
        ) : (
          sorted.map((item) => {
            const isActive = item.id === activeChatId;
            const askDelete = async () => {
              const ok = await confirm({
                title: "Delete chat?",
                message: item.title,
                confirmLabel: "Delete",
                destructive: true,
              });
              if (ok) onDelete(item.id);
            };
            return (
              <View key={item.id} style={[styles.row, isActive && styles.rowActive]}>
                <Pressable
                  onPress={() => onSelect(item.id)}
                  style={styles.rowTap}
                  accessibilityLabel={
                    isActive ? `Current chat: ${item.title}` : `Open chat: ${item.title}`
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: isActive }}
                >
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={styles.rowMeta}>{formatRelative(item.updatedAt)}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void askDelete()}
                  hitSlop={12}
                  style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.5 }]}
                  accessibilityLabel={`Delete chat: ${item.title}`}
                  accessibilityRole="button"
                >
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            );
          })
        )}
      </BottomSheetScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  headerBack: {
    color: colors.textSecondary,
    ...typography.micro,
  },
  headerTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  headerAction: {
    color: colors.accent,
    ...typography.micro,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCardGlass,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  rowActive: {
    borderColor: colors.accent,
  },
  rowTap: {
    flex: 1,
  },
  rowTitle: {
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  rowMeta: {
    color: colors.textMuted,
    ...typography.micro,
    marginTop: 2,
  },
  deleteBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  deleteText: {
    color: colors.textSecondary,
    ...typography.micro,
  },
  empty: {
    paddingTop: spacing.xl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.textPrimary,
    ...typography.title,
  },
  emptyText: {
    color: colors.textMuted,
    ...typography.bodyMd,
    textAlign: "center",
  },
  emptyAction: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.md,
  },
  emptyActionText: {
    color: colors.accent,
    ...typography.bodyMd,
  },
});
