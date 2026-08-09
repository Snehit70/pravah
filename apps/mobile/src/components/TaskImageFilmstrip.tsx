import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import {
  AlertCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
  PlusIcon,
  RetryArrowIcon,
  SmartphoneIcon,
  StackPlusIcon,
  TrashIcon,
} from "./UiIcons";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import type { TaskImageSourceKind, TaskImageState } from "../lib/taskImageCoordinator";

export type TaskImageFilmstripSurface = "capture" | "inbox" | "edit" | "completed" | "management";

export type TaskImageFilmstripEntry = {
  taskImageId: string;
  position: number;
  state: TaskImageState;
  previewUri?: string;
  caption?: string;
  progress?: number;
  failure?: { code: string; message?: string; retryable: boolean };
  presentation?: {
    width?: number;
    height?: number;
    aspectRatio?: number;
    hasTransparency?: boolean;
    variantSet?: string;
  };
};

export type RecoverableTaskImageEntry = {
  taskImageId: string;
  caption?: string;
  recoverableUntil?: number;
};

type DeliveryResult =
  | { kind: "ready"; url: string }
  | { kind: "not_found" }
  | { kind: "state"; state: string };

type TaskImageFilmstripProps = {
  surface?: TaskImageFilmstripSurface;
  images: TaskImageFilmstripEntry[];
  recoverable?: RecoverableTaskImageEntry[];
  onSelectSource?: (kind: TaskImageSourceKind) => void | Promise<void>;
  onRetry?: (taskImageId: string) => void;
  onCaptionChange?: (taskImageId: string, caption: string) => void;
  onReorder?: (taskImageId: string, direction: "up" | "down") => void;
  onRemove?: (taskImageId: string) => void;
  onRestore?: (taskImageId: string, replaceTaskImageId?: string) => void;
  resolveDelivery?: (
    taskImageId: string,
    variant: "card" | "detail"
  ) => Promise<DeliveryResult>;
};

const FAILURE_COPY: Record<string, string> = {
  unsupported_format: "This image format is not supported.",
  animated_image: "Animated images are not supported.",
  source_too_large: "This image is too large to prepare safely.",
  dimensions_too_large: "This image's dimensions are not supported.",
  aspect_ratio_unsupported: "This image is too wide or tall to use.",
  clipboard_too_large: "The clipboard image is too large to paste safely.",
  storage_unavailable: "More device storage is needed to prepare this image.",
  memory_unavailable: "This image could not be prepared within device memory limits.",
  master_too_large: "This image could not be reduced within the upload limit.",
  variant_too_large: "The prepared image did not meet delivery limits.",
  source_unavailable: "The selected image is no longer available.",
  normalization_failed: "This image could not be prepared safely.",
};

function stateCopy(image: TaskImageFilmstripEntry) {
  if (image.state === "preparing") return "Preparing image";
  if (image.state === "pending") return "Waiting to upload";
  if (image.state === "uploading") return "Uploading image";
  if (image.state === "verifying") return "Verifying image";
  if (image.state === "failed") {
    return FAILURE_COPY[image.failure?.code ?? "normalization_failed"] ?? FAILURE_COPY.normalization_failed;
  }
  return "Image unavailable";
}

function statusLabel(image: TaskImageFilmstripEntry) {
  if (image.state === "uploading" && image.progress !== undefined) {
    return `${Math.round(image.progress * 100)}%`;
  }
  if (image.state === "failed") return "Upload failed";
  if (image.state === "verifying") return "Verifying";
  if (image.state === "pending") return "Waiting";
  if (image.state === "preparing") return "Preparing";
  return "";
}

function StatusMark({ image, compact = false }: { image: TaskImageFilmstripEntry; compact?: boolean }) {
  const label = statusLabel(image);
  if (!label) return null;
  const failed = image.state === "failed";
  return (
    <View style={[styles.statusMark, compact && styles.statusMarkCompact, failed ? styles.statusFailed : styles.statusUploading]}>
      {failed ? <AlertCircleIcon color={colors.error} size={compact ? 13 : 16} /> : null}
      <Text style={[styles.statusMarkText, failed && styles.statusFailedText]}>{label}</Text>
    </View>
  );
}

function ReadyTaskImage({
  image,
  resolveDelivery,
  variant,
  style,
  accessibilityLabel,
}: {
  image: TaskImageFilmstripEntry;
  resolveDelivery?: TaskImageFilmstripProps["resolveDelivery"];
  variant: "card" | "detail";
  style?: object;
  accessibilityLabel?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(!resolveDelivery);
  const requestKey = `${image.taskImageId}:${variant}`;
  const retriedRequestRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!resolveDelivery) return () => { active = false; };
    void resolveDelivery(image.taskImageId, variant)
      .then((result) => {
        if (!active) return;
        if (result.kind === "ready") setUrl(result.url);
        else setUnavailable(true);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => { active = false; };
  }, [image.taskImageId, resolveDelivery, variant]);

  const handleDeliveryError = () => {
    setUrl(null);
    if (!resolveDelivery || retriedRequestRef.current === requestKey) {
      setUnavailable(true);
      return;
    }
    retriedRequestRef.current = requestKey;
    void resolveDelivery(image.taskImageId, variant)
      .then((result) => {
        if (result.kind === "ready") setUrl(result.url);
        else setUnavailable(true);
      })
      .catch(() => setUnavailable(true));
  };

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.image, style]}
        contentFit="cover"
        cachePolicy="memory"
        accessibilityLabel={accessibilityLabel ?? (image.position === 0 ? "Primary Task image" : "Task image")}
        onError={handleDeliveryError}
      />
    );
  }
  return <Text style={styles.stateText}>{unavailable ? "Image unavailable" : "Resolving image"}</Text>;
}

type SourceIcon = typeof StackPlusIcon;

function SourceActions({
  onSelectSource,
  full = false,
}: {
  onSelectSource?: (kind: TaskImageSourceKind) => void | Promise<void>;
  full?: boolean;
}) {
  if (!onSelectSource) return null;
  const actions: Array<{ kind: TaskImageSourceKind; label: string; icon: SourceIcon }> = [
    { kind: "photos", label: "Photos", icon: StackPlusIcon },
    { kind: "camera", label: "Camera", icon: SmartphoneIcon },
    { kind: "paste", label: "Paste", icon: CopyIcon },
  ];
  return (
    <View style={[styles.sourceRow, full && styles.sourceRowFull]}>
      {actions.map(({ kind, label, icon: Icon }) => (
        <Pressable
          key={kind}
          accessibilityRole="button"
          accessibilityLabel={kind === "camera"
            ? "Take Task image with Camera"
            : kind === "paste"
              ? "Paste Task image from clipboard"
              : `Add Task image from ${label}`}
          onPress={() => void onSelectSource(kind)}
          style={({ pressed }) => [full ? styles.sourceButtonFull : styles.sourceButton, pressed && styles.pressed]}
        >
          <Icon color={colors.accent} size={full ? 18 : 17} />
          <Text style={styles.sourceButtonText}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function EmptyImages({ onSelectSource }: { onSelectSource?: (kind: TaskImageSourceKind) => void | Promise<void> }) {
  return (
    <View style={styles.emptyImages}>
      <View style={styles.emptyImageIcon}><PlusIcon color={colors.accent} size={22} /></View>
      <Text style={styles.emptyImagesTitle}>Add a visual reference</Text>
      <Text style={styles.emptyImagesBody}>Images stay with this Task and never carry into the next capture.</Text>
      <SourceActions onSelectSource={onSelectSource} />
    </View>
  );
}

function ImagePreview({
  image,
  resolveDelivery,
  variant,
  style,
  showStatus = true,
  accessibilityLabel,
}: {
  image: TaskImageFilmstripEntry;
  resolveDelivery?: TaskImageFilmstripProps["resolveDelivery"];
  variant: "card" | "detail";
  style?: object;
  showStatus?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <View style={[styles.photoFrame, style]}>
      {image.previewUri && image.state !== "ready" ? (
        <Image source={{ uri: image.previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory" accessibilityLabel={accessibilityLabel ?? "Selected Task image preview"} />
      ) : image.state === "ready" ? (
        <ReadyTaskImage image={image} resolveDelivery={resolveDelivery} variant={variant} style={StyleSheet.absoluteFill} accessibilityLabel={accessibilityLabel} />
      ) : (
        <Text style={styles.stateText}>{stateCopy(image)}</Text>
      )}
      {showStatus ? <StatusMark image={image} compact /> : null}
    </View>
  );
}

function RecoverableSection({
  images,
  active,
  onRestore,
}: {
  images: RecoverableTaskImageEntry[];
  active: TaskImageFilmstripEntry[];
  onRestore?: (taskImageId: string, replaceTaskImageId?: string) => void;
}) {
  if (!onRestore || !images.length) return null;
  return (
    <View style={styles.recoverableSection}>
      <Text style={styles.recoverableHeading}>Recently removed</Text>
      {images.map((image) => (
        <View key={image.taskImageId} style={styles.recoverableRow}>
          <Text style={styles.recoverableText}>{image.caption || "Task image"}</Text>
          <View style={styles.recoverableActions}>
            {active.length < 5 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Restore removed Task image" onPress={() => onRestore(image.taskImageId)} style={styles.touchAction}>
                <Text style={styles.retryText}>Restore</Text>
              </Pressable>
            ) : active.map((replacement, index) => (
              <Pressable
                key={replacement.taskImageId}
                accessibilityRole="button"
                accessibilityLabel={`Restore removed Task image by replacing image ${index + 1}`}
                onPress={() => onRestore(image.taskImageId, replacement.taskImageId)}
                style={styles.touchAction}
              >
                <Text style={styles.retryText}>Replace {index + 1}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

function CaptureSurface({
  images,
  onSelectSource,
  onCaptionChange,
  onRemove,
}: TaskImageFilmstripProps & { images: TaskImageFilmstripEntry[] }) {
  if (!images.length) return <EmptyImages onSelectSource={onSelectSource} />;
  return (
    <>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>Images · {images.length}/5</Text>
        <SourceActions onSelectSource={onSelectSource} />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filmstripContent}>
        {images.map((image, index) => (
          <View key={image.taskImageId} style={styles.filmstripItem}>
            <View style={styles.filmstripPhotoWrap}>
              <ImagePreview image={image} variant="card" style={styles.filmstripPhoto} />
              {index === 0 ? <Text style={styles.primaryFlag}>Primary</Text> : null}
              {onRemove ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Remove Task image" onPress={() => onRemove(image.taskImageId)} style={styles.photoRemove}>
                  <CloseIcon color={colors.textInverse} size={16} />
                </Pressable>
              ) : null}
            </View>
            {onCaptionChange ? (
              <TextInput value={image.caption ?? ""} onChangeText={(caption) => onCaptionChange(image.taskImageId, caption)} placeholder="Add a caption" placeholderTextColor={colors.textMuted} maxLength={500} style={styles.captureCaptionInput} accessibilityLabel={`Caption for Task image ${index + 1}`} />
            ) : image.caption ? <Text numberOfLines={1} style={styles.photoCaption}>{image.caption}</Text> : null}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function InboxSurface({ images, resolveDelivery }: TaskImageFilmstripProps & { images: TaskImageFilmstripEntry[] }) {
  const primary = images[0];
  if (!primary) return null;
  const attention = images.filter((image) => image.state === "failed").length;
  const uploading = images.filter((image) => ["pending", "uploading", "verifying"].includes(image.state)).length;
  return (
    <View style={styles.inboxMedia} accessibilityLabel={`${images.length} Task images`}>
      <View>
        <ImagePreview image={primary} resolveDelivery={resolveDelivery} variant="card" style={styles.inboxThumb} />
        {images.length > 1 ? <Text style={styles.countBadge}>+{images.length - 1}</Text> : null}
      </View>
      {uploading || attention ? <Text style={styles.inboxStatus}>{attention ? `${attention} needs attention` : `${uploading} uploading`}</Text> : null}
    </View>
  );
}

function EditSurface({
  images,
  onSelectSource,
  onRetry,
  onCaptionChange,
  onReorder,
  onRemove,
  resolveDelivery,
}: TaskImageFilmstripProps & { images: TaskImageFilmstripEntry[] }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeSelectedIndex = Math.min(selectedIndex, Math.max(0, images.length - 1));
  const selected = images[activeSelectedIndex];

  if (!selected) return <EmptyImages onSelectSource={onSelectSource} />;

  const move = (direction: "up" | "down") => {
    const nextIndex = activeSelectedIndex + (direction === "up" ? -1 : 1);
    if (nextIndex < 0 || nextIndex >= images.length) return;
    onReorder?.(selected.taskImageId, direction);
    setSelectedIndex(nextIndex);
  };
  const remove = () => {
    onRemove?.(selected.taskImageId);
    setSelectedIndex((current) => Math.min(current, Math.max(0, images.length - 2)));
  };

  return (
    <View style={styles.editSurface}>
      <ImagePreview image={selected} resolveDelivery={resolveDelivery} variant="detail" style={styles.editHero} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editStrip}>
        {images.map((image, index) => (
          <Pressable key={image.taskImageId} accessibilityRole="button" accessibilityLabel={`Select Task image ${index + 1}`} onPress={() => setSelectedIndex(index)} style={[styles.editThumbWrap, index === activeSelectedIndex && styles.editThumbActive]}>
            <ImagePreview image={image} resolveDelivery={resolveDelivery} variant="card" style={styles.editThumb} accessibilityLabel={`Task image thumbnail ${index + 1}`} />
            <Text style={styles.editThumbNumber}>{index + 1}</Text>
          </Pressable>
        ))}
        {images.length < 5 ? <Pressable accessibilityRole="button" accessibilityLabel="Add Task image" onPress={() => void onSelectSource?.("photos")} style={styles.editAddThumb}><PlusIcon color={colors.accent} size={21} /></Pressable> : null}
      </ScrollView>
      <View style={styles.editMetaRow}>
        <Text style={styles.sectionLabel}>{activeSelectedIndex === 0 ? "PRIMARY IMAGE" : `IMAGE ${activeSelectedIndex + 1} OF ${images.length}`}</Text>
        <Text style={styles.sourceMeta}>Task image</Text>
      </View>
      {onCaptionChange ? <TextInput value={selected.caption ?? ""} onChangeText={(caption) => onCaptionChange(selected.taskImageId, caption)} placeholder="Add a caption" placeholderTextColor={colors.textMuted} maxLength={500} style={styles.editCaptionInput} accessibilityLabel={`Caption for Task image ${activeSelectedIndex + 1}`} /> : selected.caption ? <Text style={styles.captionText}>{selected.caption}</Text> : null}
      {selected.state !== "ready" ? (
        <View style={[styles.statusPanel, selected.state === "failed" ? styles.statusPanelError : styles.statusPanelProgress]}>
          <View style={styles.statusPanelCopy}>
            {selected.state === "failed" ? <AlertCircleIcon color={colors.error} size={18} /> : null}
            <View>
              <Text style={styles.statusPanelTitle}>{selected.state === "failed" ? "Upload failed" : `${stateCopy(selected)}${selected.progress !== undefined ? ` · ${Math.round(selected.progress * 100)}%` : ""}`}</Text>
              <Text style={styles.statusPanelBody}>{selected.state === "failed" ? "The Task is safe. Retry this image when ready." : "You can leave this screen while it finishes."}</Text>
            </View>
          </View>
          {selected.state === "failed" && selected.failure?.retryable && onRetry ? <Pressable accessibilityRole="button" accessibilityLabel="Retry Task image" onPress={() => onRetry(selected.taskImageId)} style={styles.retryButton}><RetryArrowIcon color={colors.error} size={16} /><Text style={styles.retryText}>Retry</Text></Pressable> : null}
        </View>
      ) : null}
      <View style={styles.editActionRow}>
        <Pressable disabled={activeSelectedIndex === 0} accessibilityRole="button" accessibilityLabel="Move Task image up" onPress={() => move("up")} style={[styles.editAction, activeSelectedIndex === 0 && styles.disabled]}><ChevronLeftIcon color={colors.textSecondary} size={18} /><Text style={styles.editActionText}>Earlier</Text></Pressable>
        <Pressable disabled={activeSelectedIndex === images.length - 1} accessibilityRole="button" accessibilityLabel="Move Task image down" onPress={() => move("down")} style={[styles.editAction, activeSelectedIndex === images.length - 1 && styles.disabled]}><Text style={styles.editActionText}>Later</Text><ChevronRightIcon color={colors.textSecondary} size={18} /></Pressable>
        {onRemove ? <Pressable accessibilityRole="button" accessibilityLabel="Remove Task image" onPress={remove} style={styles.editAction}><TrashIcon color={colors.error} size={17} /><Text style={styles.removeText}>Remove</Text></Pressable> : null}
      </View>
      <SourceActions onSelectSource={onSelectSource} full />
    </View>
  );
}

function CompletedSurface({ images, resolveDelivery }: TaskImageFilmstripProps & { images: TaskImageFilmstripEntry[] }) {
  const primary = images[0];
  if (!primary) return null;
  return (
    <View style={styles.completedRow} accessibilityLabel={`${images.length} completed Task images`}>
      <View style={styles.completedCheck}><Text style={styles.completedCheckText}>✓</Text></View>
      <View style={styles.completedCopy}><Text style={styles.completedTitle}>Task images</Text><Text style={styles.completedMeta}>{images.length} {images.length === 1 ? "image" : "images"} retained</Text></View>
      <ImagePreview image={primary} resolveDelivery={resolveDelivery} variant="card" style={styles.completedThumb} showStatus={false} />
    </View>
  );
}

function ManagementSurface({
  images,
  recoverable,
  onSelectSource,
  onRetry,
  onCaptionChange,
  onReorder,
  onRemove,
  onRestore,
  resolveDelivery,
}: TaskImageFilmstripProps & { images: TaskImageFilmstripEntry[] }) {
  const ordered = [...images].sort((left, right) => left.position - right.position);
  const [now, setNow] = useState(() => Date.now());
  const visibleRecoverable = (recoverable ?? []).filter((image) => image.recoverableUntil === undefined || image.recoverableUntil > now);

  useEffect(() => {
    const nextExpiry = (recoverable ?? []).map((image) => image.recoverableUntil).filter((expiry): expiry is number => expiry !== undefined && expiry > now).sort((left, right) => left - right)[0];
    if (nextExpiry === undefined) return;
    const timer = setTimeout(() => setNow((current) => Math.max(current, nextExpiry)), Math.max(0, nextExpiry - now));
    return () => clearTimeout(timer);
  }, [now, recoverable]);

  return (
    <View style={styles.container} accessibilityLabel="Task image Filmstrip">
      {ordered.map((image, index) => (
        <View key={image.taskImageId} style={styles.item}>
          <ImagePreview image={image} resolveDelivery={resolveDelivery} variant="card" />
          {onCaptionChange ? <TextInput value={image.caption ?? ""} onChangeText={(caption) => onCaptionChange(image.taskImageId, caption)} placeholder="Add a caption (optional)" placeholderTextColor={colors.textMuted} accessibilityLabel={`Caption for Task image ${index + 1}`} maxLength={500} style={styles.captionInput} /> : image.caption ? <Text style={styles.captionText}>{image.caption}</Text> : null}
          {onReorder || onRemove ? <View style={styles.actionRow}>
            {onReorder && index > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Move Task image up" onPress={() => onReorder(image.taskImageId, "up")} style={styles.touchAction}><Text style={styles.actionText}>↑</Text></Pressable> : null}
            {onReorder && index < ordered.length - 1 ? <Pressable accessibilityRole="button" accessibilityLabel="Move Task image down" onPress={() => onReorder(image.taskImageId, "down")} style={styles.touchAction}><Text style={styles.actionText}>↓</Text></Pressable> : null}
            {onRemove ? <Pressable accessibilityRole="button" accessibilityLabel="Remove Task image" onPress={() => onRemove(image.taskImageId)} style={styles.touchAction}><Text style={styles.removeText}>Remove</Text></Pressable> : null}
          </View> : null}
          {image.state === "failed" && image.failure?.retryable && onRetry ? <Pressable accessibilityRole="button" accessibilityLabel="Retry Task image" onPress={() => onRetry(image.taskImageId)} style={styles.retryButton}><RetryArrowIcon color={colors.accent} size={16} /><Text style={styles.retryText}>Retry</Text></Pressable> : null}
        </View>
      ))}
      {onSelectSource && ordered.length < 5 ? <SourceActions onSelectSource={onSelectSource} full /> : null}
      <RecoverableSection images={visibleRecoverable} active={ordered} onRestore={onRestore} />
    </View>
  );
}

export function TaskImageFilmstrip({ surface = "management", images, ...props }: TaskImageFilmstripProps) {
  const ordered = [...images].sort((left, right) => left.position - right.position);
  if (surface === "capture") return <CaptureSurface images={ordered} {...props} />;
  if (surface === "inbox") return <InboxSurface images={ordered} {...props} />;
  if (surface === "edit") return <EditSurface images={ordered} {...props} />;
  if (surface === "completed") return <CompletedSurface images={ordered} {...props} />;
  return <ManagementSurface images={ordered} {...props} />;
}

const styles = createThemedStyles({
  container: { gap: spacing.sm },
  item: { minHeight: 84, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  photoFrame: { overflow: "hidden", backgroundColor: colors.bgSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle },
  image: { width: "100%", height: 120 },
  stateText: { ...typography.micro, color: colors.textSecondary, padding: spacing.md },
  statusMark: { position: "absolute", right: spacing.xs, bottom: spacing.xs, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: radii.sm },
  statusMarkCompact: { paddingHorizontal: 5, paddingVertical: 2 },
  statusUploading: { backgroundColor: "rgba(32,25,20,0.74)" },
  statusFailed: { backgroundColor: "rgba(255,250,242,0.94)" },
  statusMarkText: { fontFamily: "GeistMono_500Medium", fontSize: 9, color: colors.textInverse },
  statusFailedText: { color: colors.error },
  sectionHeaderRow: { marginTop: spacing.lg, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { ...typography.micro, color: colors.textMuted },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sourceRowFull: { gap: spacing.sm, marginTop: spacing.lg },
  sourceButton: { minWidth: 44, minHeight: 44, paddingHorizontal: spacing.xs, alignItems: "center", justifyContent: "center", gap: 2 },
  sourceButtonFull: { flex: 1, minHeight: 58, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.bgSurface },
  sourceButtonText: { ...typography.micro, color: colors.textSecondary },
  emptyImages: { marginTop: spacing.lg, paddingVertical: spacing.xl, alignItems: "center", gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", borderColor: colors.border, borderRadius: radii.lg },
  emptyImageIcon: { width: 44, height: 44, borderRadius: radii.full, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  emptyImagesTitle: { ...typography.title, color: colors.textPrimary },
  emptyImagesBody: { ...typography.bodyMd, color: colors.textMuted, textAlign: "center", maxWidth: 260 },
  filmstripContent: { gap: spacing.sm, paddingRight: spacing.lg },
  filmstripItem: { width: 122 },
  filmstripPhotoWrap: { width: 122, height: 92, borderRadius: radii.lg, overflow: "hidden" },
  filmstripPhoto: { width: 122, height: 92, borderRadius: radii.lg },
  primaryFlag: { position: "absolute", left: spacing.xs, top: spacing.xs, ...typography.micro, fontSize: 9, color: colors.textInverse, backgroundColor: "rgba(32,25,20,0.72)", paddingHorizontal: 6, paddingVertical: 3, borderRadius: radii.sm, overflow: "hidden" },
  photoRemove: { position: "absolute", right: spacing.xs, top: spacing.xs, width: 44, height: 44, borderRadius: radii.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(32,25,20,0.72)" },
  photoCaption: { ...typography.bodyMd, color: colors.textSecondary, marginTop: spacing.xs },
  captureCaptionInput: { width: "100%", minHeight: 44, paddingVertical: spacing.xs, color: colors.textSecondary, ...typography.bodyMd },
  inboxMedia: { marginLeft: spacing.md, alignItems: "flex-end", gap: spacing.xs },
  inboxThumb: { width: 84, height: 68, borderRadius: radii.md },
  countBadge: { position: "absolute", right: 4, bottom: 4, ...typography.micro, color: colors.textInverse, backgroundColor: "rgba(32,25,20,0.72)", paddingHorizontal: 5, paddingVertical: 2, borderRadius: radii.sm, overflow: "hidden" },
  inboxStatus: { ...typography.micro, color: colors.warning, maxWidth: 100, textAlign: "right" },
  editSurface: { gap: spacing.sm },
  editHero: { width: "100%", aspectRatio: 1.3, borderRadius: radii.lg },
  editStrip: { paddingVertical: spacing.md, gap: spacing.sm },
  editThumbWrap: { padding: 2, borderRadius: radii.md, borderWidth: 2, borderColor: "transparent" },
  editThumbActive: { borderColor: colors.accent },
  editThumb: { width: 62, height: 54, borderRadius: radii.sm },
  editThumbNumber: { position: "absolute", left: 6, top: 6, fontFamily: "GeistMono_500Medium", fontSize: 9, color: colors.textInverse, backgroundColor: "rgba(32,25,20,0.66)", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 3, overflow: "hidden" },
  editAddThumb: { width: 66, height: 58, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  editMetaRow: { marginTop: spacing.sm, flexDirection: "row", justifyContent: "space-between" },
  sourceMeta: { ...typography.micro, color: colors.textMuted },
  editCaptionInput: { ...typography.title, color: colors.textPrimary, minHeight: 48, marginTop: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  captionInput: { width: "100%", minHeight: 44, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, color: colors.textPrimary, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderSubtle },
  captionText: { width: "100%", paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, color: colors.textSecondary, ...typography.micro },
  statusPanel: { marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  statusPanelError: { borderColor: colors.error, backgroundColor: colors.errorMuted },
  statusPanelProgress: { borderColor: colors.border, backgroundColor: colors.accentDim },
  statusPanelCopy: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  statusPanelTitle: { fontFamily: "Geist_600SemiBold", fontSize: 13, color: colors.textPrimary },
  statusPanelBody: { ...typography.bodyMd, color: colors.textSecondary, maxWidth: 230 },
  editActionRow: { marginTop: spacing.lg, flexDirection: "row", justifyContent: "space-between", gap: spacing.xs },
  editAction: { minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingHorizontal: spacing.sm },
  editActionText: { fontFamily: "Geist_600SemiBold", fontSize: 11, color: colors.textSecondary },
  disabled: { opacity: 0.28 },
  actionRow: { width: "100%", flexDirection: "row", justifyContent: "flex-end", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  touchAction: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: colors.bgFloating },
  actionText: { color: colors.textPrimary, ...typography.bodyMd },
  removeText: { color: colors.error, ...typography.micro },
  retryButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm },
  retryText: { fontFamily: "Geist_600SemiBold", fontSize: 12, color: colors.accent },
  completedRow: { minHeight: 76, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  completedCheck: { width: 28, height: 28, borderRadius: radii.full, backgroundColor: colors.successMuted, alignItems: "center", justifyContent: "center" },
  completedCheckText: { color: colors.success, fontFamily: "Geist_600SemiBold", fontSize: 16 },
  completedCopy: { flex: 1, minWidth: 0 },
  completedTitle: { ...typography.title, color: colors.textPrimary },
  completedMeta: { ...typography.micro, color: colors.textMuted, marginTop: spacing.xs },
  completedThumb: { width: 84, height: 68, borderRadius: radii.md },
  recoverableSection: { gap: spacing.xs, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.bgSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle },
  recoverableHeading: { ...typography.micro, color: colors.textSecondary },
  recoverableRow: { minHeight: 44, gap: spacing.sm },
  recoverableActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  recoverableText: { flex: 1, ...typography.bodyMd, color: colors.textPrimary },
  pressed: { opacity: 0.7 },
});
