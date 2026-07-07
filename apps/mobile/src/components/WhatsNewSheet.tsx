/**
 * WhatsNewSheet
 *
 * Bottom sheet listing recent mobile release notes, fetched from GitHub
 * releases (mobile-v* tags) and rendered natively via parseReleaseNotes.
 * Falls back to a link out to the changelog when the feed can't be loaded.
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";

import { fetchMobileReleases, type ReleaseFeedResult } from "../lib/appUpdate";
import { parseReleaseNotes } from "../lib/releaseNotes";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { ArrowUpRightIcon } from "./UiIcons";

const MAX_RELEASES = 5;

function feedErrorCopy(result: ReleaseFeedResult): string {
  switch (result.status) {
    case "offline":
      return "Could not reach GitHub. Check your connection and try again.";
    case "rate-limited":
      return result.retryAfter
        ? `GitHub rate limited this device. Try again after ${result.retryAfter}.`
        : "GitHub rate limited this device. Try again later.";
    case "malformed-metadata":
      return "The release feed could not be read safely.";
    case "ok":
      return "No mobile releases found yet.";
  }
}

type WhatsNewSheetProps = {
  visible: boolean;
  onClose: () => void;
  changelogUrl: string;
};

export function WhatsNewSheet({ visible, onClose, changelogUrl }: WhatsNewSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const [feed, setFeed] = useState<ReleaseFeedResult | null>(null);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void fetchMobileReleases().then((result) => {
      if (!cancelled) setFeed(result);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  // Reset to the loading state on close so a reopen refetches instead of
  // flashing stale (possibly errored) content.
  const handleClose = () => {
    setFeed(null);
    onClose();
  };

  const releases = feed?.status === "ok" ? feed.releases.slice(0, MAX_RELEASES) : [];

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? "none" : "slide"}
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View
        style={[styles.overlay, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}
      >
        <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.backdropDim]} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss what's new"
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
        />

        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>What's new</Text>
            <Pressable
              onPress={handleClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.closeButton, pressed && { opacity: 0.6 }]}
            >
              <Text style={styles.closeText}>Done</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {feed === null ? (
              <View style={styles.pendingBox}>
                <ActivityIndicator color={colors.textMuted} />
                <Text style={styles.pendingText}>Loading release notes…</Text>
              </View>
            ) : feed.status !== "ok" || releases.length === 0 ? (
              <View style={styles.pendingBox}>
                <Text style={styles.pendingText}>{feedErrorCopy(feed)}</Text>
                <Pressable
                  onPress={() => void Linking.openURL(changelogUrl)}
                  hitSlop={12}
                  accessibilityRole="link"
                  accessibilityLabel="Open changelog on GitHub"
                  style={({ pressed }) => [styles.fallbackLink, pressed && { opacity: 0.6 }]}
                >
                  <Text style={styles.fallbackLinkText}>Open changelog on GitHub</Text>
                  <ArrowUpRightIcon color={colors.textMuted} size={14} />
                </Pressable>
              </View>
            ) : (
              releases.map((release, index) => (
                <View key={release.version} style={styles.release}>
                  {index > 0 ? <View style={styles.releaseDivider} /> : null}
                  <View style={styles.releaseHeader}>
                    <Text style={styles.releaseVersion}>Version {release.version}</Text>
                    {index === 0 ? (
                      <View style={styles.latestPill}>
                        <Text style={styles.latestPillText}>Latest</Text>
                      </View>
                    ) : null}
                  </View>
                  {parseReleaseNotes(release.notes).map((block, blockIndex) => {
                    if (block.type === "heading") {
                      return (
                        <Text key={blockIndex} style={styles.noteHeading}>
                          {block.text}
                        </Text>
                      );
                    }
                    if (block.type === "bullet") {
                      return (
                        <View key={blockIndex} style={styles.bulletRow}>
                          <Text style={styles.bulletDot}>•</Text>
                          <Text style={styles.noteText}>{block.text}</Text>
                        </View>
                      );
                    }
                    return (
                      <Text key={blockIndex} style={styles.noteText}>
                        {block.text}
                      </Text>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xxl,
  },
  backdropDim: {
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  card: {
    width: "100%",
    maxWidth: 480,
    maxHeight: "85%",
    backgroundColor: colors.bg,
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  closeButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  closeText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  scrollArea: {
    flexShrink: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    gap: spacing.sm,
  },
  pendingBox: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  pendingText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    textAlign: "center",
  },
  fallbackLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  fallbackLinkText: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  release: {
    gap: spacing.sm,
  },
  releaseDivider: {
    height: 1,
    backgroundColor: colors.bgInput,
    marginHorizontal: -spacing.lg,
    marginVertical: spacing.md,
  },
  releaseHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  releaseVersion: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  latestPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  latestPillText: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  noteHeading: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginTop: spacing.xs,
  },
  bulletRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  bulletDot: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 19,
  },
  noteText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    lineHeight: 19,
    flexShrink: 1,
  },
});
