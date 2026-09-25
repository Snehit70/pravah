import { useMemo, type ReactNode } from "react";
import {
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  LinearTransition,
} from "react-native-reanimated";

import { parseReleaseNotes, type NoteBlock } from "../lib/releaseNotes";
import { colors, motion, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { useReducedMotion } from "../hooks/useReducedMotion";
import GithubIconAsset from "../assets/icons/about-github.svg";
import ReleaseFeatIconAsset from "../assets/icons/release-feat.svg";
import ReleaseFixIconAsset from "../assets/icons/release-fix.svg";
import MegaphoneIconAsset from "../assets/icons/megaphone.svg";
import {
  AdjustmentsIcon,
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FileTextIcon,
  GitBranchIcon,
  PulseIcon,
  StackPlusIcon,
  SyncLoopIcon,
  UpdateArrowIcon,
} from "./UiIcons";

const MAX_RELEASES = 5;

const whatsNewRadii = {
  panel: 12,
  compact: 4,
  link: 8,
} as const;

const NOTES_EASING = Easing.bezier(...motion.easing.outQuart);

type WhatsNewRelease = {
  version: string;
  releaseNotes: string;
  title?: string;
  publishedAt?: number;
  pullRequests?: number[];
};

type WhatsNewPageProps = {
  changelogUrl: string;
  repositoryUrl: string;
  releases: WhatsNewRelease[];
  isLoading?: boolean;
  expandedReleaseKeys: Record<string, boolean>;
  onToggleReleaseNotes: (releaseKey: string) => void;
};

type ReleaseKind =
  | "fix"
  | "feature"
  | "docs"
  | "refactor"
  | "performance"
  | "test"
  | "build"
  | "ci"
  | "revert"
  | "style"
  | "security"
  | "other";

type ReleaseContent = {
  title: string | null;
  kind: ReleaseKind;
  blocks: NoteBlock[];
};

function classifyReleaseKind(title: string | null): ReleaseKind {
  const normalized = title?.toLowerCase().trim() ?? "";
  if (/^(fix|bugfix|hotfix)\b/.test(normalized)) return "fix";
  if (/^(feat|feature)\b/.test(normalized)) return "feature";
  if (/^(doc|docs|documentation)\b/.test(normalized)) return "docs";
  if (/^(refactor|cleanup)\b/.test(normalized)) return "refactor";
  if (/^(perf|performance)\b/.test(normalized)) return "performance";
  if (/^(test|tests)\b/.test(normalized)) return "test";
  if (/^(build|release)\b/.test(normalized)) return "build";
  if (/^(ci|workflow)\b/.test(normalized)) return "ci";
  if (/^(revert|rollback)\b/.test(normalized)) return "revert";
  if (/^(style|styling)\b/.test(normalized)) return "style";
  if (/^(security|sec)\b/.test(normalized)) return "security";
  return "other";
}

function getReleaseKindLabel(kind: ReleaseKind) {
  switch (kind) {
    case "fix":
      return "Fix";
    case "feature":
      return "Feature";
    case "docs":
      return "Docs";
    case "refactor":
      return "Refactor";
    case "performance":
      return "Performance";
    case "test":
      return "Test";
    case "build":
      return "Build";
    case "ci":
      return "CI";
    case "revert":
      return "Revert";
    case "style":
      return "Style";
    case "security":
      return "Security";
    case "other":
      return "Update";
  }
}

function getReleaseContent(release: WhatsNewRelease): ReleaseContent {
  const blocks = parseReleaseNotes(release.releaseNotes);
  const headingIndex = blocks.findIndex((block) => block.type === "heading");
  const heading = headingIndex >= 0 ? blocks[headingIndex] : null;
  const explicitTitle = release.title?.trim() || null;
  const title = explicitTitle ?? (heading?.type === "heading" ? heading.text : null);

  return {
    title,
    kind: classifyReleaseKind(title),
    blocks: explicitTitle ? blocks : blocks.filter((_, index) => index !== headingIndex),
  };
}

function formatReleaseDate(publishedAt?: number) {
  if (!publishedAt) return null;
  return new Date(publishedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ReleaseKindIcon({
  kind,
  color,
  size,
}: {
  kind: ReleaseKind;
  color: string;
  size: number;
}) {
  const props = { color, size, strokeWidth: 1.8 };
  switch (kind) {
    case "fix":
      return <ReleaseFixIconAsset width={size} height={size} color={color} />;
    case "feature":
      return <ReleaseFeatIconAsset width={size} height={size} color={color} />;
    case "docs":
      return <FileTextIcon {...props} />;
    case "refactor":
      return <AdjustmentsIcon {...props} />;
    case "performance":
      return <PulseIcon {...props} />;
    case "test":
      return <CheckIcon {...props} />;
    case "build":
      return <StackPlusIcon {...props} />;
    case "ci":
      return <GitBranchIcon {...props} />;
    case "revert":
      return <UpdateArrowIcon {...props} />;
    case "style":
      return <AdjustmentsIcon {...props} />;
    case "security":
      return <CheckIcon {...props} />;
    case "other":
      return <SyncLoopIcon {...props} />;
  }
}

function ReleaseKindBadge({ kind }: { kind: ReleaseKind }) {
  return (
    <View style={styles.releaseKindPill}>
      <ReleaseKindIcon kind={kind} color={colors.accent} size={13} />
      <Text style={styles.releaseKindText}>{getReleaseKindLabel(kind)}</Text>
    </View>
  );
}

function PullRequestLink({
  release,
  repositoryUrl,
}: {
  release: WhatsNewRelease;
  repositoryUrl: string;
}) {
  const pullRequests = release.pullRequests ?? [];
  if (pullRequests.length === 0) return null;

  const pullRequestLabel =
    pullRequests.length === 1
      ? `PR #${pullRequests[0]}`
      : `PRs ${pullRequests.map((number) => `#${number}`).join(", ")}`;
  const firstPullRequest = pullRequests[0];

  return (
    <Pressable
      onPress={() => void Linking.openURL(`${repositoryUrl}/pull/${firstPullRequest}`)}
      hitSlop={8}
      accessibilityRole="link"
      accessibilityLabel={`Open ${pullRequestLabel} on GitHub`}
      style={({ pressed }) => [styles.pullRequestLink, pressed && { opacity: 0.6 }]}
    >
      <GithubIconAsset width={14} height={14} color={colors.accent} />
      <Text style={styles.pullRequestText}>{pullRequestLabel}</Text>
      <ArrowUpRightIcon color={colors.accent} size={14} />
    </Pressable>
  );
}

function ReleaseNotes({
  content,
  reducedMotion,
  expanded,
  onToggle,
}: {
  content: ReleaseContent;
  reducedMotion: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const contentBlockCount = content.blocks.filter((block) => block.type !== "heading").length;
  const firstContentIndex = content.blocks.findIndex((block) => block.type !== "heading");
  const nextHeadingIndex = content.blocks.findIndex(
    (block, index) => index > firstContentIndex && block.type === "heading",
  );
  const firstCollapsedBlockCount = nextHeadingIndex >= 0
    ? nextHeadingIndex
    : Math.max(firstContentIndex + 1, 0);
  const canExpand = contentBlockCount > 1;
  const visibleBlocks =
    canExpand && !expanded
      ? content.blocks.slice(0, firstCollapsedBlockCount)
      : content.blocks;
  const notesTransition = useMemo(
    () =>
      reducedMotion
        ? undefined
        : LinearTransition.duration(motion.duration.fast).easing(NOTES_EASING),
    [reducedMotion],
  );
  const noteTransitions = useMemo(
    () =>
      reducedMotion
        ? undefined
        : {
            entering: FadeInDown.duration(motion.duration.fast).easing(NOTES_EASING),
            exiting: FadeOutUp.duration(motion.duration.instant).easing(NOTES_EASING),
          },
    [reducedMotion],
  );

  return (
    <Animated.View layout={notesTransition}>
      {visibleBlocks.map((block, index) => {
        let contentView: ReactNode;
        if (block.type === "heading") {
          contentView = (
            <Text style={styles.noteHeading} accessibilityRole="header">
              {block.text}
            </Text>
          );
        } else if (block.type === "bullet") {
          contentView = (
            <View style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.noteText}>{block.text}</Text>
            </View>
          );
        } else {
          contentView = <Text style={styles.noteText}>{block.text}</Text>;
        }

        return (
          <Animated.View
            key={index}
            entering={noteTransitions?.entering}
            exiting={noteTransitions?.exiting}
          >
            {contentView}
          </Animated.View>
        );
      })}
      {canExpand ? (
        <Pressable
          onPress={onToggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={expanded ? "Show fewer release notes" : "Read full release notes"}
          style={({ pressed }) => [styles.notesToggle, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.notesToggleText}>
            {expanded ? "Show less" : "Read full notes"}
          </Text>
          {expanded ? (
            <ChevronUpIcon color={colors.accent} size={15} />
          ) : (
            <ChevronDownIcon color={colors.accent} size={15} />
          )}
        </Pressable>
      ) : null}
    </Animated.View>
  );
}

function ReleaseHistorySkeleton() {
  return (
    <View
      style={styles.loadingPanel}
      accessibilityRole="progressbar"
      accessibilityLabel="Loading release history"
    >
      <View style={styles.loadingHeader}>
        <View style={styles.loadingIcon} />
        <View style={styles.loadingHeaderCopy}>
          <View style={[styles.loadingLine, styles.loadingLineShort]} />
          <View style={styles.loadingLine} />
        </View>
      </View>
      <View style={[styles.loadingLine, styles.loadingLineStrong]} />
      <View style={styles.loadingLine} />
      <View style={[styles.loadingLine, styles.loadingLineShort]} />
    </View>
  );
}

function LatestRelease({
  release,
  repositoryUrl,
  reducedMotion,
  expanded,
  onToggle,
}: {
  release: WhatsNewRelease;
  repositoryUrl: string;
  reducedMotion: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const content = getReleaseContent(release);
  const publishedDate = formatReleaseDate(release.publishedAt);

  return (
    <View style={styles.latestPanel}>
      <View style={styles.latestHeader}>
        <View style={styles.latestTypeMark}>
          <ReleaseKindIcon kind={content.kind} color={colors.accent} size={21} />
        </View>
        <View style={styles.releaseMeta}>
          <View style={styles.releaseVersionRow}>
            <Text style={styles.releaseVersion}>Version {release.version}</Text>
            <ReleaseKindBadge kind={content.kind} />
          </View>
          {publishedDate ? <Text style={styles.releaseDate}>{publishedDate}</Text> : null}
        </View>
        <View style={styles.latestPill}>
          <Text style={styles.latestPillText}>Latest</Text>
        </View>
      </View>
      {content.title ? <Text style={styles.releaseTitle}>{content.title}</Text> : null}
      <PullRequestLink release={release} repositoryUrl={repositoryUrl} />
      <ReleaseNotes
        content={content}
        reducedMotion={reducedMotion}
        expanded={expanded}
        onToggle={onToggle}
      />
    </View>
  );
}

function HistoryRelease({
  release,
  repositoryUrl,
  content,
  reducedMotion,
  expanded,
  onToggle,
}: {
  release: WhatsNewRelease;
  repositoryUrl: string;
  content: ReleaseContent;
  reducedMotion: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const publishedDate = formatReleaseDate(release.publishedAt);

  return (
    <View style={styles.historyItem}>
      <View style={styles.historyItemHeader}>
        <View style={styles.historyItemVersionRow}>
          <Text style={styles.historyItemVersion}>Version {release.version}</Text>
          <ReleaseKindBadge kind={content.kind} />
        </View>
        {publishedDate ? <Text style={styles.historyItemDate}>{publishedDate}</Text> : null}
      </View>
      {content.title ? <Text style={styles.historyItemTitle}>{content.title}</Text> : null}
      <PullRequestLink release={release} repositoryUrl={repositoryUrl} />
      <ReleaseNotes
        content={content}
        reducedMotion={reducedMotion}
        expanded={expanded}
        onToggle={onToggle}
      />
    </View>
  );
}

export function WhatsNewPage({
  changelogUrl,
  repositoryUrl,
  releases,
  isLoading = false,
  expandedReleaseKeys,
  onToggleReleaseNotes,
}: WhatsNewPageProps) {
  const reducedMotion = useReducedMotion();
  const recentReleases = releases.slice(0, MAX_RELEASES);
  const latestRelease = recentReleases[0];
  const earlierReleases = recentReleases.slice(1);
  const contentTransition = useMemo(
    () =>
      reducedMotion
        ? undefined
        : {
            entering: FadeIn.duration(motion.duration.fast).easing(NOTES_EASING),
            exiting: FadeOut.duration(motion.duration.instant).easing(NOTES_EASING),
          },
    [reducedMotion],
  );

  return (
    <View style={styles.page}>
      <View style={styles.pageIntro}>
        <Text style={styles.pageEyebrow} accessibilityRole="header">
          Release history
        </Text>
      </View>

      <Animated.View
        key={isLoading ? "loading" : "loaded"}
        entering={contentTransition?.entering}
        exiting={contentTransition?.exiting}
      >
        {isLoading ? (
          <ReleaseHistorySkeleton />
        ) : latestRelease ? (
          <>
            <LatestRelease
              release={latestRelease}
              repositoryUrl={repositoryUrl}
              reducedMotion={reducedMotion}
              expanded={expandedReleaseKeys[latestRelease.version] ?? false}
              onToggle={() => onToggleReleaseNotes(latestRelease.version)}
            />
            {earlierReleases.length > 0 ? (
              <>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyHeaderTitle} accessibilityRole="header">
                    Earlier releases
                  </Text>
                  <View style={styles.historyCountPill}>
                    <MegaphoneIconAsset width={13} height={13} color={colors.accent} />
                    <Text style={styles.historyCount}>{earlierReleases.length} updates</Text>
                  </View>
                </View>
                <View style={styles.historyPanel}>
                  <View style={styles.historyTimeline}>
                    {earlierReleases.map((release, index) => {
                      const content = getReleaseContent(release);
                      return (
                        <View key={release.version} style={styles.timelineItem}>
                          <View style={styles.timelineRail}>
                            <View style={styles.timelineTypeMark}>
                              <ReleaseKindIcon
                                kind={content.kind}
                                color={colors.accent}
                                size={16}
                              />
                            </View>
                            {index < earlierReleases.length - 1 ? (
                              <View style={styles.timelineLine} />
                            ) : null}
                          </View>
                          <View style={styles.timelineContent}>
                            <HistoryRelease
                              release={release}
                              repositoryUrl={repositoryUrl}
                              content={content}
                              reducedMotion={reducedMotion}
                              expanded={expandedReleaseKeys[release.version] ?? false}
                              onToggle={() => onToggleReleaseNotes(release.version)}
                            />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </>
            ) : null}
          </>
        ) : (
          <View style={styles.emptyPanel}>
            <Text style={styles.emptyTitle}>No releases yet</Text>
            <Text style={styles.emptyText}>
              Published mobile updates will appear here as soon as they are ready.
            </Text>
          </View>
        )}
      </Animated.View>

      <Pressable
        onPress={() => void Linking.openURL(changelogUrl)}
        hitSlop={8}
        accessibilityRole="link"
        accessibilityLabel="Open full changelog on GitHub"
        style={({ pressed }) => [styles.changelogLink, pressed && { opacity: 0.6 }]}
      >
        <View style={styles.changelogLinkCopy}>
          <Text style={styles.changelogLinkTitle}>Read the full changelog</Text>
          <Text style={styles.changelogLinkText}>See every update in the repository.</Text>
        </View>
        <ArrowUpRightIcon color={colors.accent} size={17} />
      </Pressable>
    </View>
  );
}

const styles = createThemedStyles({
  page: {
    gap: spacing.lg,
  },
  pageIntro: {
    gap: spacing.xs,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  pageEyebrow: {
    ...typography.micro,
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  latestPanel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: whatsNewRadii.panel,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  latestTypeMark: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.accentDim,
  },
  latestHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  releaseMeta: {
    flex: 1,
    gap: 3,
  },
  releaseVersionRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  releaseVersion: {
    ...typography.title,
    color: colors.textPrimary,
  },
  releaseKindPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: whatsNewRadii.compact,
    backgroundColor: colors.accentDim,
  },
  releaseKindText: {
    ...typography.micro,
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  releaseDate: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  latestPill: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: whatsNewRadii.compact,
    backgroundColor: colors.accentDim,
  },
  latestPillText: {
    ...typography.micro,
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  releaseTitle: {
    ...typography.title,
    color: colors.textPrimary,
    lineHeight: 22,
  },
  pullRequestLink: {
    minHeight: 32,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  pullRequestText: {
    ...typography.micro,
    color: colors.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  historyPanel: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    borderRadius: whatsNewRadii.panel,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  historyTimeline: {
    gap: spacing.lg,
  },
  timelineItem: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: spacing.sm,
  },
  timelineRail: {
    width: 30,
    alignItems: "center",
  },
  timelineTypeMark: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.md,
    backgroundColor: colors.accentDim,
  },
  timelineLine: {
    position: "absolute",
    top: 28,
    bottom: -spacing.lg,
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  timelineContent: {
    flex: 1,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
  },
  historyHeaderTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  historyCountPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: whatsNewRadii.compact,
    backgroundColor: colors.accentDim,
  },
  historyCount: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  historyItem: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  historyItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  historyItemVersionRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  historyItemVersion: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  historyItemDate: {
    ...typography.micro,
    color: colors.textMuted,
  },
  historyItemTitle: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    lineHeight: 21,
  },
  noteHeading: {
    ...typography.micro,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: spacing.xs,
  },
  bulletRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  bulletDot: {
    ...typography.bodyMd,
    color: colors.accent,
    lineHeight: 21,
  },
  noteText: {
    ...typography.bodyMd,
    color: colors.textSecondary,
    lineHeight: 21,
    flexShrink: 1,
  },
  notesToggle: {
    minHeight: 36,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: spacing.xs,
  },
  notesToggleText: {
    ...typography.bodyMd,
    color: colors.accent,
    fontFamily: "Geist_600SemiBold",
  },
  loadingPanel: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: whatsNewRadii.panel,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  loadingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  loadingIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.bgInput,
  },
  loadingHeaderCopy: {
    flex: 1,
    gap: spacing.sm,
  },
  loadingLine: {
    height: 12,
    borderRadius: radii.sm,
    backgroundColor: colors.bgInput,
  },
  loadingLineShort: {
    width: "58%",
  },
  loadingLineStrong: {
    height: 20,
    width: "82%",
  },
  emptyPanel: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: whatsNewRadii.panel,
    backgroundColor: colors.bgCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  emptyTitle: {
    ...typography.title,
    color: colors.textPrimary,
  },
  emptyText: {
    ...typography.bodyMd,
    color: colors.textMuted,
    lineHeight: 21,
  },
  changelogLink: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: whatsNewRadii.link,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  changelogLinkCopy: {
    flex: 1,
    gap: 3,
  },
  changelogLinkTitle: {
    ...typography.bodyMd,
    color: colors.textPrimary,
    fontFamily: "Geist_600SemiBold",
  },
  changelogLinkText: {
    ...typography.bodyMd,
    color: colors.textMuted,
  },
});
