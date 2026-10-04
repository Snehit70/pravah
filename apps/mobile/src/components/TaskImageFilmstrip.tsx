import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import {
  AlertCircleIcon,
  ChevronRightIcon,
  CheckIcon,
  CloseIcon,
  CopyIcon,
  GripHorizontalIcon,
  ImagePlusIcon,
  PlusIcon,
  RetryArrowIcon,
  SmartphoneIcon,
  StackPlusIcon,
} from "./UiIcons";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { getViewerImages, hasTaskImageVisual, TaskImageViewer } from "./TaskImageViewer";
import { TaskImageSourceSheet } from "./TaskImageSourceSheet";
import type { TaskImageSourceKind, TaskImageState } from "../lib/taskImageCoordinator";
import { haptic } from "../lib/haptic";
import { reorderTaskImagesByDrag } from "../lib/taskImageReorder";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";

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

export type TaskImageRetryState = Pick<
  TaskImageFilmstripEntry,
  "taskImageId" | "state" | "previewUri" | "caption" | "progress" | "failure"
>;

export type RecoverableTaskImageEntry = {
  taskImageId: string;
  caption?: string;
  recoverableUntil?: number;
};

type DeliveryResult =
  | { kind: "ready"; url: string }
  | { kind: "not_found" }
  | { kind: "state"; state: string }
  | { kind: "deferred" };

type TaskImageFilmstripProps = {
  surface?: TaskImageFilmstripSurface;
  images: TaskImageFilmstripEntry[];
  recoverable?: RecoverableTaskImageEntry[];
  onSelectSource?: (kind: TaskImageSourceKind) => void | Promise<void>;
  onRetry?: (taskImageId: string) => void;
  onCaptionChange?: (taskImageId: string, caption: string) => void;
  onReorder?: (orderedTaskImageIds: string[]) => void;
  onRemove?: (taskImageId: string) => void;
  onRestore?: (taskImageId: string, replaceTaskImageId?: string) => void;
  resolveDelivery?: (
    taskImageId: string,
    variant: "card" | "detail",
    options?: { download?: boolean },
  ) => Promise<DeliveryResult>;
};

function requestDelivery(
  resolveDelivery: NonNullable<TaskImageFilmstripProps["resolveDelivery"]>,
  taskImageId: string,
  variant: "card" | "detail",
  download: boolean,
) {
  if (download) return resolveDelivery(taskImageId, variant);
  return resolveDelivery(taskImageId, variant, { download: false });
}

type OpenImage = (taskImageId: string) => void;
type OpenSource = () => void;

const FAILURE_COPY: Record<string, string> = {
  unsupported_format: "This image format is not supported.",
  animated_image: "Animated images are not supported.",
  source_too_large: "This image is too large to prepare safely.",
  dimensions_too_large: "This image's dimensions are not supported.",
  aspect_ratio_unsupported: "This image is too wide or tall to use.",
  clipboard_too_large: "The clipboard image is too large to paste safely.",
  clipboard_reference_only: "Clipboard contains a file reference, not image data. Copy the image itself and paste again.",
  storage_unavailable: "More device storage is needed to prepare this image.",
  memory_unavailable: "This image could not be prepared within device memory limits.",
  master_too_large: "This image could not be reduced within the upload limit.",
  variant_too_large: "The prepared image did not meet delivery limits.",
  source_unavailable: "The selected image is no longer available.",
  normalization_failed: "This image could not be prepared safely.",
  network_error: "Upload interrupted. Try again when you're connected.",
  upload_failed: "This image could not be uploaded. Try again.",
  provider_unavailable: "The image service is unavailable. Try again shortly.",
  authorization_failed: "Sign in again to upload this image.",
  usage_blocked: "Image uploads are paused. Try again later.",
};

const PREPARATION_FAILURE_CODES = new Set([
  "unsupported_format",
  "animated_image",
  "source_too_large",
  "dimensions_too_large",
  "aspect_ratio_unsupported",
  "clipboard_too_large",
  "clipboard_reference_only",
  "storage_unavailable",
  "memory_unavailable",
  "master_too_large",
  "variant_too_large",
  "source_unavailable",
  "normalization_failed",
]);

function moveImage(images: TaskImageFilmstripEntry[], index: number, direction: "up" | "down") {
  const nextIndex = index + (direction === "up" ? -1 : 1);
  if (nextIndex < 0 || nextIndex >= images.length) return images;
  const next = [...images];
  [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
  return next;
}

function DragHandle({ onDrop, disabled, slotWidth, compact = false }: { onDrop: (translationX: number) => void; disabled: boolean; slotWidth: number; compact?: boolean }) {
  const gesture = Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => runOnJS(haptic.selection)())
    .onEnd((event) => runOnJS(onDrop)(event.translationX));
  return (
    <GestureDetector gesture={gesture}>
      <Pressable
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Hold and drag to reorder Task image"
        accessibilityHint={`Drag horizontally to reposition this image. Each slot is about ${slotWidth} points wide.`}
        hitSlop={4}
        style={({ pressed }) => [compact ? styles.dragHandleCompact : styles.dragHandle, pressed && styles.dragHandlePressed]}
      >
        <GripHorizontalIcon color={colors.textInverse} size={compact ? 14 : 20} strokeWidth={2} />
      </Pressable>
    </GestureDetector>
  );
}

function failureTitle(image: TaskImageFilmstripEntry) {
  return PREPARATION_FAILURE_CODES.has(image.failure?.code ?? "")
    ? "Image could not be prepared"
    : "Upload failed";
}

function uploadStatusCopy(image: TaskImageFilmstripEntry) {
  if (isFailedImage(image)) {
    let body = "Choose another image to try again.";
    if (image.failure?.retryable) {
      body = image.previewUri
        ? "Your image is saved on this device. Try uploading again."
        : "Your task is safe. Retry this image when ready.";
    }
    return { title: failureTitle(image), body };
  }
  if (image.state === "verifying") {
    return { title: "Upload received", body: "Finishing up. You can close this task." };
  }
  if (image.state === "preparing") {
    return { title: "Preparing image", body: "Saving a local copy of your image." };
  }
  return {
    title: image.previewUri ? "Saved on this device" : "Upload in progress",
    body: "You can close this task. Upload continues while you use Pravah.",
  };
}

function isFailedImage(image: TaskImageFilmstripEntry) {
  return image.state === "failed" || (image.state === "verifying" && Boolean(image.failure));
}

function stateCopy(image: TaskImageFilmstripEntry) {
  if (image.state === "preparing") return "Preparing image";
  if (image.state === "pending") return "Selected image";
  if (image.state === "uploading") return "Uploading image";
  if (isFailedImage(image)) {
    return FAILURE_COPY[image.failure?.code ?? "normalization_failed"] ?? FAILURE_COPY.normalization_failed;
  }
  if (image.state === "verifying") return "Verifying image";
  return "Image unavailable";
}

function statusLabel(image: TaskImageFilmstripEntry) {
  if (image.state === "uploading" && image.progress !== undefined) {
    return `${Math.round(image.progress * 100)}%`;
  }
  if (isFailedImage(image)) return failureTitle(image);
  if (image.state === "uploading") return "Uploading";
  if (image.state === "verifying") return "Finishing";
  if (image.state === "preparing") return "Preparing";
  return "";
}

function StatusMark({ image, compact = false }: { image: TaskImageFilmstripEntry; compact?: boolean }) {
  const [completion, setCompletion] = useState({ state: image.state, visible: false });
  if (completion.state !== image.state) {
    setCompletion({ state: image.state, visible: image.state === "ready" });
  }
  useEffect(() => {
    if (!completion.visible) return;
    const timer = setTimeout(() => setCompletion((current) => ({ ...current, visible: false })), 2_500);
    return () => clearTimeout(timer);
  }, [completion.visible]);
  if (image.state === "ready" && completion.visible) {
    return (
      <View style={[styles.statusMark, styles.statusSuccess]} accessibilityLabel="Image uploaded" accessibilityLiveRegion="polite">
        <CheckIcon color={colors.textInverse} size={compact ? 13 : 16} />
        {!compact ? <Text style={[styles.statusMarkText, styles.statusSuccessText]}>Image uploaded</Text> : null}
      </View>
    );
  }
  const label = statusLabel(image);
  if (!label) return null;
  const failed = isFailedImage(image);
  const percentage = image.state === "uploading" && image.progress !== undefined
    ? Math.round(Math.max(0, Math.min(1, image.progress)) * 100)
    : undefined;
  if (!compact && !failed) {
    const title = image.state === "uploading"
      ? `Uploading${percentage === undefined ? "…" : ` · ${percentage}%`}`
      : image.state === "verifying" ? "Finishing upload…" : "Preparing image…";
    return (
      <View
        style={styles.uploadOverlay}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={title}
        accessibilityValue={percentage === undefined ? { text: title } : { min: 0, max: 100, now: percentage }}
      >
        <Text style={styles.uploadOverlayText}>{title}</Text>
        {percentage !== undefined ? (
          <View style={styles.uploadTrack}>
            <View style={[styles.uploadFill, { width: `${percentage}%` }]} />
          </View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.statusMark, compact && styles.statusMarkCompact, failed ? styles.statusFailed : styles.statusUploading]}>
      {failed ? <AlertCircleIcon color={colors.error} size={compact ? 13 : 16} /> : null}
      <Text numberOfLines={1} style={[styles.statusMarkText, failed && styles.statusFailedText]}>{compact && failed ? "Failed" : label}</Text>
    </View>
  );
}

function ReadyTaskImage({
  image,
  resolveDelivery,
  variant,
  download = true,
  style,
  accessibilityLabel,
}: {
  image: TaskImageFilmstripEntry;
  resolveDelivery?: TaskImageFilmstripProps["resolveDelivery"];
  variant: "card" | "detail";
  download?: boolean;
  style?: object;
  accessibilityLabel?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(!resolveDelivery);
  const [deferred, setDeferred] = useState(false);
  const requestKey = `${image.taskImageId}:${variant}:${download}`;
  const retriedRequestRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!resolveDelivery) return () => { active = false; };
    void requestDelivery(resolveDelivery, image.taskImageId, variant, download)
      .then((result) => {
        if (!active) return;
        if (result.kind === "ready") {
          setUrl(result.url);
          setDeferred(false);
          return;
        }
        if (result.kind === "deferred") {
          setDeferred(true);
          setUnavailable(false);
          return;
        }
        setUnavailable(true);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => { active = false; };
  }, [download, image.taskImageId, resolveDelivery, variant]);

  const handleDeliveryError = () => {
    setUrl(null);
    if (!resolveDelivery || !download || retriedRequestRef.current === requestKey) {
      setUnavailable(true);
      return;
    }
    retriedRequestRef.current = requestKey;
    void requestDelivery(resolveDelivery, image.taskImageId, variant, true)
      .then((result) => {
        if (result.kind === "ready") setUrl(result.url);
        else if (result.kind === "deferred") setDeferred(true);
        else setUnavailable(true);
      })
      .catch(() => setUnavailable(true));
  };

  if (deferred && !url) {
    return <Text style={styles.stateText}>Open to load</Text>;
  }

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.image, style]}
        contentFit="cover"
        cachePolicy="memory-disk"
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

function EmptyImages({ onOpenSource, compact = false }: { onOpenSource?: OpenSource; compact?: boolean }) {
  const content = (
    <>
      <View style={styles.emptyImageIcon}><ImagePlusIcon color={colors.accent} size={30} /></View>
      <View style={compact ? styles.compactEmptyCopy : undefined}>
        <Text style={styles.emptyImagesTitle}>{compact ? "Add a visual reference" : "Add an image"}</Text>
        <Text style={[styles.emptyImagesBody, compact && styles.compactEmptyBody]}>{compact ? "Tap to choose an image" : "Tap the image area to add a visual reference."}</Text>
      </View>
      {compact ? <ChevronRightIcon color={colors.textMuted} size={18} /> : null}
    </>
  );
  if (!onOpenSource) return <View style={compact ? styles.emptyImagesCompact : styles.emptyImages}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add Task image"
      onPress={onOpenSource}
      style={({ pressed }) => [compact ? styles.emptyImagesCompact : styles.emptyImages, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );
}

function ImagePreview({
  image,
  resolveDelivery,
  variant,
  download = true,
  style,
  showStatus = true,
  compactStatus = true,
  accessibilityLabel,
  onPress,
  onPressLabel,
}: {
  image: TaskImageFilmstripEntry;
  resolveDelivery?: TaskImageFilmstripProps["resolveDelivery"];
  variant: "card" | "detail";
  download?: boolean;
  style?: object;
  showStatus?: boolean;
  compactStatus?: boolean;
  accessibilityLabel?: string;
  onPress?: () => void;
  onPressLabel?: string;
}) {
  const content = (
    <>
      {image.previewUri && image.state !== "ready" ? (
        <Image source={{ uri: image.previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory" accessibilityLabel={accessibilityLabel ?? "Selected Task image preview"} />
      ) : image.state === "ready" ? (
        <ReadyTaskImage key={`${image.taskImageId}:${variant}:${download}`} image={image} resolveDelivery={resolveDelivery} variant={variant} download={download} style={StyleSheet.absoluteFill} accessibilityLabel={accessibilityLabel} />
      ) : (
        <Text style={styles.stateText}>{stateCopy(image)}</Text>
      )}
      {showStatus ? <StatusMark key={image.taskImageId} image={image} compact={compactStatus} /> : null}
    </>
  );
  if (!onPress) return <View style={[styles.photoFrame, style]}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={onPressLabel ?? "Open Task image"}
      onPress={onPress}
      style={[styles.photoFrame, style]}
    >
      {content}
    </Pressable>
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
  onCaptionChange,
  onReorder,
  onRemove,
  onOpenImage,
  onOpenSource,
}: TaskImageFilmstripProps & { images: TaskImageFilmstripEntry[]; onOpenImage?: OpenImage; onOpenSource?: OpenSource }) {
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  if (!images.length) return <EmptyImages onOpenSource={onOpenSource} compact />;
  return (
    <>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>Images · {images.length}/5</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filmstripContent}>
        {images.map((image, index) => {
          return (
          <View
            key={image.taskImageId}
            style={styles.filmstripItem}
            accessibilityLabel={`Task image ${index + 1} of ${images.length}${index === 0 ? ", Primary" : ""}`}
            accessibilityActions={[
              ...(index > 0 ? [{ name: "moveEarlier", label: "Move Task image earlier" }] : []),
              ...(index < images.length - 1 ? [{ name: "moveLater", label: "Move Task image later" }] : []),
            ]}
            onAccessibilityAction={(event) => {
              const direction = event.nativeEvent.actionName === "moveEarlier" ? "up" : event.nativeEvent.actionName === "moveLater" ? "down" : null;
              if (!direction) return;
              const next = moveImage(images, index, direction);
              onReorder?.(next.map((entry) => entry.taskImageId));
            }}
          >
            <View style={styles.filmstripPhotoWrap}>
              <ImagePreview
                image={image}
                variant="card"
                style={styles.filmstripPhoto}
                onPress={onOpenImage && hasTaskImageVisual(image) ? () => onOpenImage(image.taskImageId) : undefined}
                onPressLabel={`Open Task image ${index + 1}`}
              />
              {index === 0 ? <Text style={styles.primaryFlag}>Primary</Text> : null}
              {onReorder && images.length > 1 ? <DragHandle slotWidth={130} onDrop={(translationX) => {
                const next = reorderTaskImagesByDrag(images, index, translationX, 130);
                onReorder(next.map((entry) => entry.taskImageId));
              }} disabled={false} /> : null}
              {onRemove ? (
                <Pressable accessibilityRole="button" accessibilityLabel="Remove Task image" onPress={() => onRemove(image.taskImageId)} style={styles.photoRemove}>
                  <CloseIcon color={colors.textInverse} size={16} />
                </Pressable>
              ) : null}
            </View>
            {onCaptionChange ? (
              <TextInput
                value={captionDrafts[image.taskImageId] ?? image.caption ?? ""}
                onChangeText={(caption) => {
                  setCaptionDrafts((current) => ({ ...current, [image.taskImageId]: caption }));
                  onCaptionChange(image.taskImageId, caption);
                }}
                placeholder="Add a caption"
                placeholderTextColor={colors.textMuted}
                maxLength={500}
                style={styles.captureCaptionInput}
                accessibilityLabel={`Caption for Task image ${index + 1}`}
              />
            ) : image.caption ? <Text numberOfLines={1} style={styles.photoCaption}>{image.caption}</Text> : null}
          </View>
        );
        })}
        {onOpenSource && images.length < 5 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Add Task image"
            onPress={onOpenSource}
            style={({ pressed }) => [styles.captureAddThumb, pressed && styles.pressed]}
          >
            <PlusIcon color={colors.accent} size={24} />
          </Pressable>
        ) : null}
      </ScrollView>
    </>
  );
}

function InboxSurface({ images, resolveDelivery, onOpenImage }: TaskImageFilmstripProps & { images: TaskImageFilmstripEntry[]; onOpenImage?: OpenImage }) {
  const primary = images[0];
  if (!primary) return null;
  const attention = images.filter((image) => image.state === "failed").length;
  const uploading = images.filter((image) => ["pending", "uploading", "verifying"].includes(image.state)).length;
  return (
    <View style={styles.inboxMedia} accessibilityLabel={`${images.length} Task images`}>
      <View>
        <ImagePreview
          image={primary}
          resolveDelivery={resolveDelivery}
          variant="card"
          download={false}
          style={styles.inboxThumb}
          onPress={onOpenImage && hasTaskImageVisual(primary) ? () => onOpenImage(primary.taskImageId) : undefined}
          onPressLabel="Open primary Task image"
        />
        {images.length > 1 ? <Text style={styles.countBadge}>+{images.length - 1}</Text> : null}
      </View>
      {uploading || attention ? <Text style={styles.inboxStatus}>{attention ? `${attention} needs attention` : `${uploading} uploading`}</Text> : null}
    </View>
  );
}

function EditSurface({
  images,
  recoverable,
  onRetry,
  onCaptionChange,
  onReorder,
  onRemove,
  onRestore,
  resolveDelivery,
  onOpenImage,
  onOpenSource,
}: TaskImageFilmstripProps & { images: TaskImageFilmstripEntry[]; onOpenImage?: OpenImage; onOpenSource?: OpenSource }) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const [now, setNow] = useState(() => Date.now());
  const visibleRecoverable = (recoverable ?? []).filter((image) => image.recoverableUntil === undefined || image.recoverableUntil > now);
  useEffect(() => {
    const nextExpiry = (recoverable ?? [])
      .map((image) => image.recoverableUntil)
      .filter((expiry): expiry is number => expiry !== undefined && expiry > now)
      .sort((left, right) => left - right)[0];
    if (nextExpiry === undefined) return;
    const timer = setTimeout(() => setNow((current) => Math.max(current, nextExpiry)), Math.max(0, nextExpiry - now));
    return () => clearTimeout(timer);
  }, [now, recoverable]);
  const activeSelectedIndex = Math.min(selectedIndex, Math.max(0, images.length - 1));
  const selected = images[activeSelectedIndex];

  if (!selected) {
    return (
      <View style={styles.editSurface}>
        <EmptyImages onOpenSource={onOpenSource} />
        <RecoverableSection images={visibleRecoverable} active={images} onRestore={onRestore} />
      </View>
    );
  }

  const remove = () => {
    onRemove?.(selected.taskImageId);
    setSelectedIndex((current) => Math.min(current, Math.max(0, images.length - 2)));
  };
  const selectedCaption = captionDrafts[selected.taskImageId] ?? selected.caption ?? "";
  const uploadStatus = uploadStatusCopy(selected);

  return (
    <View style={styles.editSurface}>
      <ImagePreview
        image={selected}
        resolveDelivery={resolveDelivery}
        variant="detail"
        style={styles.editHero}
        compactStatus={false}
        onPress={onOpenImage && hasTaskImageVisual(selected) ? () => onOpenImage(selected.taskImageId) : undefined}
        onPressLabel={`Open Task image ${activeSelectedIndex + 1}`}
      />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.editStrip}>
        {images.map((image, index) => {
          return (
            <View
              key={image.taskImageId}
              style={styles.editThumbDragWrap}
              accessibilityLabel={`Task image ${index + 1} of ${images.length}${index === 0 ? ", Primary" : ""}`}
              accessibilityActions={[
                ...(index > 0 ? [{ name: "moveEarlier", label: "Move Task image earlier" }] : []),
                ...(index < images.length - 1 ? [{ name: "moveLater", label: "Move Task image later" }] : []),
              ]}
              onAccessibilityAction={(event) => {
                const direction = event.nativeEvent.actionName === "moveEarlier" ? "up" : event.nativeEvent.actionName === "moveLater" ? "down" : null;
                if (!direction) return;
                const next = moveImage(images, index, direction);
                setSelectedIndex(next.findIndex((entry) => entry.taskImageId === selected.taskImageId));
                onReorder?.(next.map((entry) => entry.taskImageId));
              }}
            >
              <Pressable accessibilityRole="button" accessibilityLabel={`Select Task image ${index + 1}`} onPress={() => setSelectedIndex(index)} style={[styles.editThumbWrap, index === activeSelectedIndex && styles.editThumbActive]}>
                <ImagePreview image={image} resolveDelivery={resolveDelivery} variant="card" style={styles.editThumb} accessibilityLabel={`Task image thumbnail ${index + 1}`} />
                <Text style={styles.editThumbNumber}>{index + 1}</Text>
              </Pressable>
              {onRemove && index === activeSelectedIndex ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove Task image"
                  onPress={remove}
                  hitSlop={8}
                  style={styles.editThumbRemove}
                >
                  <CloseIcon color={colors.textInverse} size={14} />
                </Pressable>
              ) : null}
              {onReorder && images.length > 1 ? <DragHandle slotWidth={70} onDrop={(translationX) => {
                const next = reorderTaskImagesByDrag(images, index, translationX, 70);
                setSelectedIndex(next.findIndex((entry) => entry.taskImageId === selected.taskImageId));
                onReorder(next.map((entry) => entry.taskImageId));
              }} disabled={false} compact /> : null}
            </View>
          );
        })}
        {onOpenSource && images.length < 5 ? <Pressable accessibilityRole="button" accessibilityLabel="Add Task image" onPress={onOpenSource} style={styles.editAddThumb}><PlusIcon color={colors.accent} size={21} /></Pressable> : null}
      </ScrollView>
      <View style={styles.editMetaRow}>
        <Text style={styles.sectionLabel}>{activeSelectedIndex === 0 ? "PRIMARY IMAGE" : `IMAGE ${activeSelectedIndex + 1} OF ${images.length}`}</Text>
        <Text style={styles.sourceMeta}>Task image</Text>
      </View>
      {onCaptionChange ? (
        <TextInput
          value={selectedCaption}
          onChangeText={(caption) => setCaptionDrafts((current) => ({ ...current, [selected.taskImageId]: caption }))}
          onBlur={() => onCaptionChange(selected.taskImageId, selectedCaption)}
          placeholder="Add a caption"
          placeholderTextColor={colors.textMuted}
          maxLength={500}
          style={styles.editCaptionInput}
          accessibilityLabel={`Caption for Task image ${activeSelectedIndex + 1}`}
        />
      ) : selected.caption ? <Text style={styles.captionText}>{selected.caption}</Text> : null}
      {selected.state !== "ready" && selected.state !== "pending" ? (
        <View style={[styles.statusPanel, isFailedImage(selected) ? styles.statusPanelError : styles.statusPanelProgress]}>
          <View style={styles.statusPanelCopy}>
            {isFailedImage(selected) ? <AlertCircleIcon color={colors.error} size={18} /> : null}
            <View>
              <Text style={styles.statusPanelTitle}>{uploadStatus.title}</Text>
              <Text style={styles.statusPanelBody}>{uploadStatus.body}</Text>
            </View>
          </View>
          {isFailedImage(selected) && selected.failure?.retryable && onRetry ? <Pressable accessibilityRole="button" accessibilityLabel="Retry Task image" onPress={() => onRetry(selected.taskImageId)} style={styles.retryButton}><RetryArrowIcon color={colors.error} size={16} /><Text style={styles.retryText}>Retry</Text></Pressable> : null}
        </View>
      ) : null}
      <RecoverableSection images={visibleRecoverable} active={images} onRestore={onRestore} />
    </View>
  );
}

function CompletedSurface({ images, resolveDelivery, onOpenImage }: TaskImageFilmstripProps & { images: TaskImageFilmstripEntry[]; onOpenImage?: OpenImage }) {
  const primary = images[0];
  if (!primary) return null;
  return (
    <View style={styles.completedRow} accessibilityLabel={`${images.length} completed Task images`}>
      <View style={styles.completedCheck}><Text style={styles.completedCheckText}>✓</Text></View>
      <View style={styles.completedCopy}><Text style={styles.completedTitle}>Task images</Text><Text style={styles.completedMeta}>{images.length} {images.length === 1 ? "image" : "images"} retained</Text></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.completedMedia}>
        {images.map((image, index) => (
          <View key={image.taskImageId} style={styles.completedItem}>
            <View>
              <ImagePreview
                image={image}
                resolveDelivery={resolveDelivery}
                variant="card"
                style={styles.completedThumb}
                showStatus={false}
                accessibilityLabel={`Completed Task image ${index + 1}`}
                onPress={onOpenImage && hasTaskImageVisual(image) ? () => onOpenImage(image.taskImageId) : undefined}
                onPressLabel={`Open Completed Task image ${index + 1}`}
              />
              {index === 0 && images.length > 1 ? <Text style={styles.countBadge}>+{images.length - 1}</Text> : null}
            </View>
            {image.caption ? <Text numberOfLines={2} style={styles.completedCaption}>{image.caption}</Text> : null}
          </View>
        ))}
      </ScrollView>
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
  onOpenImage,
}: TaskImageFilmstripProps & { images: TaskImageFilmstripEntry[]; onOpenImage?: OpenImage }) {
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
          <ImagePreview
            image={image}
            resolveDelivery={resolveDelivery}
            variant="card"
            compactStatus={false}
            onPress={onOpenImage && hasTaskImageVisual(image) ? () => onOpenImage(image.taskImageId) : undefined}
            onPressLabel={`Open Task image ${index + 1}`}
          />
          {onCaptionChange ? <TextInput value={image.caption ?? ""} onChangeText={(caption) => onCaptionChange(image.taskImageId, caption)} placeholder="Add a caption (optional)" placeholderTextColor={colors.textMuted} accessibilityLabel={`Caption for Task image ${index + 1}`} maxLength={500} style={styles.captionInput} /> : image.caption ? <Text style={styles.captionText}>{image.caption}</Text> : null}
          {onReorder || onRemove ? <View style={styles.actionRow}>
            {onReorder && index > 0 ? <Pressable accessibilityRole="button" accessibilityLabel="Move Task image up" onPress={() => onReorder(moveImage(ordered, index, "up").map((entry) => entry.taskImageId))} style={styles.touchAction}><Text style={styles.actionText}>↑</Text></Pressable> : null}
            {onReorder && index < ordered.length - 1 ? <Pressable accessibilityRole="button" accessibilityLabel="Move Task image down" onPress={() => onReorder(moveImage(ordered, index, "down").map((entry) => entry.taskImageId))} style={styles.touchAction}><Text style={styles.actionText}>↓</Text></Pressable> : null}
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
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const { resolveDelivery } = props;
  useEffect(() => {
    if (!resolveDelivery) return;
    let active = true;
    const missing = images.filter((image) => !image.previewUri && image.state !== "ready");
    void Promise.all(missing.map(async (image) => {
      const delivery = await resolveDelivery(image.taskImageId, "detail", { download: false }).catch(() => null);
      return delivery?.kind === "ready" ? [image.taskImageId, delivery.url] as const : null;
    })).then((resolved) => {
      if (!active) return;
      const next = Object.fromEntries(resolved.filter((entry) => entry !== null));
      setLocalPreviews((previous) => {
        const ids = Object.keys(next);
        return ids.length === Object.keys(previous).length && ids.every((id) => next[id] === previous[id])
          ? previous : next;
      });
    });
    return () => { active = false; };
  }, [images, resolveDelivery]);
  const ordered = images.map((image) => {
    const previewUri = image.previewUri ?? localPreviews[image.taskImageId];
    return previewUri ? { ...image, previewUri } : image;
  }).sort((left, right) => left.position - right.position);
  const { onSelectSource } = props;
  const [viewer, setViewer] = useState<{ images: TaskImageFilmstripEntry[]; initialIndex: number } | null>(null);
  const openViewer = useCallback((taskImageId: string) => {
    const viewerImages = getViewerImages(ordered);
    const initialIndex = viewerImages.findIndex((image) => image.taskImageId === taskImageId);
    if (initialIndex < 0) return;
    setViewer({ images: viewerImages, initialIndex });
  }, [ordered]);
  const [sourceSheetVisible, setSourceSheetVisible] = useState(false);
  const openSource = useCallback(() => {
    if (!onSelectSource) return;
    setSourceSheetVisible(true);
  }, [onSelectSource]);
  const surfaceProps = {
    ...props,
    onOpenImage: openViewer,
    onOpenSource: onSelectSource ? openSource : undefined,
  };
  return (
    <>
      {surface === "capture" ? <CaptureSurface images={ordered} {...surfaceProps} /> : null}
      {surface === "inbox" ? <InboxSurface images={ordered} {...surfaceProps} /> : null}
      {surface === "edit" ? <EditSurface images={ordered} {...surfaceProps} /> : null}
      {surface === "completed" ? <CompletedSurface images={ordered} {...surfaceProps} /> : null}
      {surface === "management" ? <ManagementSurface images={ordered} {...surfaceProps} /> : null}
      {viewer ? <TaskImageViewer {...viewer} visible resolveDelivery={props.resolveDelivery} onClose={() => setViewer(null)} /> : null}
      {onSelectSource ? <TaskImageSourceSheet visible={sourceSheetVisible} onClose={() => setSourceSheetVisible(false)} onSelectSource={onSelectSource} /> : null}
    </>
  );
}

const styles = createThemedStyles({
  container: { gap: spacing.sm },
  item: { minHeight: 84, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  photoFrame: { overflow: "hidden", backgroundColor: colors.bgSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle },
  image: { width: "100%", height: 120 },
  stateText: { ...typography.micro, color: colors.textSecondary, padding: spacing.md },
  statusMark: { position: "absolute", right: spacing.xs, bottom: spacing.xs, flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: radii.sm },
  statusMarkCompact: { paddingHorizontal: 5, paddingVertical: 2 },
  statusUploading: { backgroundColor: colors.bgFloating },
  statusFailed: { backgroundColor: colors.bgFloating },
  statusSuccess: { backgroundColor: colors.success },
  statusMarkText: { fontFamily: "GeistMono_500Medium", fontSize: 9, color: colors.textPrimary },
  statusSuccessText: { color: colors.textInverse },
  uploadOverlay: { position: "absolute", left: spacing.md, right: spacing.md, bottom: spacing.md, padding: spacing.md, gap: spacing.sm, borderRadius: radii.md, backgroundColor: colors.bgFloating },
  uploadOverlayText: { fontFamily: "Geist_600SemiBold", fontSize: 14, color: colors.textPrimary },
  uploadTrack: { height: 3, width: "100%", borderRadius: radii.full, overflow: "hidden", backgroundColor: colors.border },
  uploadFill: { height: "100%", backgroundColor: colors.accent, borderRadius: radii.full },
  statusFailedText: { color: colors.error },
  sectionHeaderRow: { marginTop: spacing.lg, marginBottom: spacing.sm, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionLabel: { ...typography.micro, color: colors.textMuted },
  sourceRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  sourceRowFull: { gap: spacing.sm, marginTop: spacing.lg },
  sourceButton: { minWidth: 44, minHeight: 44, paddingHorizontal: spacing.xs, alignItems: "center", justifyContent: "center", gap: 2 },
  sourceButtonFull: { flex: 1, minHeight: 58, flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radii.md, backgroundColor: colors.bgSurface },
  sourceButtonText: { ...typography.micro, color: colors.textSecondary },
  emptyImages: { marginTop: spacing.lg, paddingVertical: spacing.xl, alignItems: "center", gap: spacing.sm, borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", borderColor: colors.border, borderRadius: radii.lg },
  emptyImagesCompact: { minHeight: 84, marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, flexDirection: "row", alignItems: "center", gap: spacing.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle, borderRadius: radii.lg, backgroundColor: colors.bgCard },
  compactEmptyCopy: { flex: 1, gap: 2 },
  compactEmptyBody: { textAlign: "left" },
  emptyImageIcon: { width: 44, height: 44, borderRadius: radii.full, backgroundColor: colors.accentSoft, alignItems: "center", justifyContent: "center" },
  emptyImagesTitle: { ...typography.title, color: colors.textPrimary },
  emptyImagesBody: { ...typography.bodyMd, color: colors.textMuted, textAlign: "center", maxWidth: 260 },
  filmstripContent: { gap: spacing.sm, paddingRight: spacing.lg },
  filmstripItem: { width: 122 },
  filmstripPhotoWrap: { width: 122, height: 92, borderRadius: radii.lg, overflow: "hidden" },
  filmstripPhoto: { width: 122, height: 92, borderRadius: radii.lg },
  draggingItem: { opacity: 0.94, transform: [{ scale: 1.03 }], elevation: 8, shadowColor: colors.textPrimary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.16, shadowRadius: 12 },
  dragHandle: { position: "absolute", left: "50%", bottom: spacing.xs, width: 44, height: 44, marginLeft: -22, borderRadius: radii.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(32,25,20,0.72)" },
  dragHandleCompact: { position: "absolute", left: "50%", bottom: -10, width: 28, height: 28, marginLeft: -14, borderRadius: radii.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(32,25,20,0.72)" },
  dragHandlePressed: { backgroundColor: "rgba(32,25,20,0.9)" },
  captureAddThumb: { width: 122, height: 92, alignItems: "center", justifyContent: "center", borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderStyle: "dashed", borderColor: colors.border, backgroundColor: colors.bgSurface },
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
  editThumbDragWrap: { position: "relative" },
  editThumbActive: { borderColor: colors.accent },
  editThumb: { width: 62, height: 54, borderRadius: radii.sm },
  editThumbNumber: { position: "absolute", left: 6, top: 6, fontFamily: "GeistMono_500Medium", fontSize: 9, color: colors.textInverse, backgroundColor: "rgba(32,25,20,0.66)", paddingHorizontal: 4, paddingVertical: 2, borderRadius: 3, overflow: "hidden" },
  editThumbRemove: { position: "absolute", right: -8, top: -8, width: 32, height: 32, borderRadius: radii.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(32,25,20,0.78)", zIndex: 2 },
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
  disabled: { opacity: 0.28 },
  actionRow: { width: "100%", flexDirection: "row", justifyContent: "flex-end", gap: spacing.xs, paddingHorizontal: spacing.sm, paddingBottom: spacing.sm },
  touchAction: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.sm, borderRadius: radii.md, backgroundColor: colors.bgFloating },
  actionText: { color: colors.textPrimary, ...typography.bodyMd },
  removeText: { color: colors.error, ...typography.micro },
  retryButton: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: spacing.xs, paddingHorizontal: spacing.sm },
  retryText: { fontFamily: "Geist_600SemiBold", fontSize: 12, color: colors.accent },
  completedRow: { minHeight: 76, paddingVertical: spacing.md, flexDirection: "row", alignItems: "center", gap: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  completedMedia: { gap: spacing.sm, paddingRight: spacing.md },
  completedItem: { width: 84, gap: spacing.xs },
  completedCheck: { width: 28, height: 28, borderRadius: radii.full, backgroundColor: colors.successMuted, alignItems: "center", justifyContent: "center" },
  completedCheckText: { color: colors.success, fontFamily: "Geist_600SemiBold", fontSize: 16 },
  completedCopy: { flex: 1, minWidth: 0 },
  completedTitle: { ...typography.title, color: colors.textPrimary },
  completedMeta: { ...typography.micro, color: colors.textMuted, marginTop: spacing.xs },
  completedThumb: { width: 84, height: 68, borderRadius: radii.md },
  completedCaption: { ...typography.micro, color: colors.textSecondary },
  recoverableSection: { gap: spacing.xs, padding: spacing.sm, borderRadius: radii.lg, backgroundColor: colors.bgSurface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderSubtle },
  recoverableHeading: { ...typography.micro, color: colors.textSecondary },
  recoverableRow: { minHeight: 44, gap: spacing.sm },
  recoverableActions: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  recoverableText: { flex: 1, ...typography.bodyMd, color: colors.textPrimary },
  pressed: { opacity: 0.7 },
});
