/**
 * KairoChatList
 *
 * Inline panel rendered inside the Kairo bottom sheet when the user opens
 * the chat menu. Lists past chats (newest first), offers a "New chat" CTA,
 * and a destructive delete row gated behind a native confirm.
 */

import { useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import type { ChatMeta } from "../lib/kairoChatStorage";
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

function formatRelative(updatedAt: number): string {
  const diff = Date.now() - updatedAt;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(updatedAt).toLocaleDateString();
}

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

      <BottomSheetFlatList<ChatMeta>
        data={sorted}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No chats yet.</Text>
          </View>
        }
        renderItem={({ item }) => {
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
            <View style={[styles.row, isActive && styles.rowActive]}>
              <Pressable
                onPress={() => onSelect(item.id)}
                style={styles.rowTap}
                accessibilityLabel={`Open chat: ${item.title}`}
                accessibilityRole="button"
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
        }}
      />
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
  },
  emptyText: {
    color: colors.textMuted,
    ...typography.bodyMd,
  },
});
