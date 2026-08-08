import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import type { TaskImageSourceKind, TaskImageState } from "../lib/taskImageCoordinator";

export type TaskImageFilmstripEntry = {
  taskImageId: string;
  position: number;
  state: TaskImageState;
  previewUri?: string;
  caption?: string;
  failure?: { code: string; retryable: boolean };
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

function ReadyTaskImage({
  image,
  resolveDelivery,
}: {
  image: TaskImageFilmstripEntry;
  resolveDelivery?: TaskImageFilmstripProps["resolveDelivery"];
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(!resolveDelivery);
  const retriedRef = useRef(false);

  useEffect(() => {
    let active = true;
    if (!resolveDelivery) return () => { active = false; };
    void resolveDelivery(image.taskImageId, "card")
      .then((result) => {
        if (!active) return;
        if (result.kind === "ready") setUrl(result.url);
        else setUnavailable(true);
      })
      .catch(() => {
        if (active) setUnavailable(true);
      });
    return () => { active = false; };
  }, [image.taskImageId, resolveDelivery]);

  const handleDeliveryError = () => {
    setUrl(null);
    if (!resolveDelivery || retriedRef.current) {
      setUnavailable(true);
      return;
    }
    retriedRef.current = true;
    void resolveDelivery(image.taskImageId, "card")
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
        style={styles.image}
        contentFit="cover"
        cachePolicy="memory"
        accessibilityLabel={image.position === 0 ? "Primary Task image" : "Task image"}
        onError={handleDeliveryError}
      />
    );
  }
  return <Text style={styles.stateText}>{unavailable ? "Image unavailable" : "Resolving image"}</Text>;
}

function SourceButton({
  label,
  shortLabel,
  onPress,
}: {
  label: string;
  shortLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.sourceButton, pressed && styles.pressed]}
    >
      <Text style={styles.sourceButtonText}>{shortLabel}</Text>
    </Pressable>
  );
}

export function TaskImageFilmstrip({
  images,
  recoverable = [],
  onSelectSource,
  onRetry,
  onCaptionChange,
  onReorder,
  onRemove,
  onRestore,
  resolveDelivery,
}: TaskImageFilmstripProps) {
  const [now, setNow] = useState(() => Date.now());
  const ordered = [...images].sort((left, right) => left.position - right.position);
  const visibleRecoverable = recoverable.filter(
    (image) => image.recoverableUntil === undefined || image.recoverableUntil > now
  );

  useEffect(() => {
    const nextExpiry = recoverable
      .map((image) => image.recoverableUntil)
      .filter((expiry): expiry is number => expiry !== undefined && expiry > now)
      .sort((left, right) => left - right)[0];
    if (nextExpiry === undefined) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.max(0, nextExpiry - Date.now()));
    return () => clearTimeout(timer);
  }, [now, recoverable]);

  return (
    <View style={styles.container} accessibilityLabel="Task image Filmstrip">
      {ordered.map((image, index) => (
        <View key={image.taskImageId} style={styles.item}>
          {image.previewUri && image.state !== "ready" ? (
            <Image
              source={{ uri: image.previewUri }}
              style={styles.image}
              contentFit="cover"
              cachePolicy="memory"
              accessibilityLabel="Selected Task image preview"
            />
          ) : image.state === "ready" ? (
            <ReadyTaskImage image={image} resolveDelivery={resolveDelivery} />
          ) : (
            <Text style={styles.stateText}>{stateCopy(image)}</Text>
          )}
          {onCaptionChange ? (
            <TextInput
              defaultValue={image.caption ?? ""}
              onChangeText={(caption) => onCaptionChange(image.taskImageId, caption)}
              placeholder="Add a caption (optional)"
              placeholderTextColor={colors.textMuted}
              accessibilityLabel={`Caption for Task image ${index + 1}`}
              maxLength={500}
              style={styles.captionInput}
            />
          ) : image.caption ? (
            <Text style={styles.captionText}>{image.caption}</Text>
          ) : null}
          {onReorder || onRemove ? (
            <View style={styles.actionRow}>
              {onReorder && index > 0 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move Task image up"
                  onPress={() => onReorder(image.taskImageId, "up")}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionText}>↑</Text>
                </Pressable>
              ) : null}
              {onReorder && index < ordered.length - 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Move Task image down"
                  onPress={() => onReorder(image.taskImageId, "down")}
                  style={styles.actionButton}
                >
                  <Text style={styles.actionText}>↓</Text>
                </Pressable>
              ) : null}
              {onRemove ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove Task image"
                  onPress={() => onRemove(image.taskImageId)}
                  style={styles.actionButton}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {image.state === "failed" && image.failure?.retryable && onRetry ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Retry Task image"
              onPress={() => onRetry(image.taskImageId)}
              style={styles.retryButton}
            >
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          ) : null}
        </View>
      ))}

      {onSelectSource && ordered.length < 5 ? (
        <View style={styles.sourceRow}>
          <SourceButton
            label="Add Task image from Photos"
            shortLabel="Photos"
            onPress={() => onSelectSource("photos")}
          />
          <SourceButton
            label="Take Task image with Camera"
            shortLabel="Camera"
            onPress={() => onSelectSource("camera")}
          />
          <SourceButton
            label="Paste Task image from clipboard"
            shortLabel="Paste"
            onPress={() => onSelectSource("paste")}
          />
        </View>
      ) : null}
      {onRestore && visibleRecoverable.length > 0 ? (
        <View style={styles.recoverableSection}>
          <Text style={styles.recoverableHeading}>Recently removed</Text>
          {visibleRecoverable.map((image) => (
            <View key={image.taskImageId} style={styles.recoverableRow}>
              <Text style={styles.recoverableText}>
                {image.caption || "Task image"}
              </Text>
              <View style={styles.recoverableActions}>
                {ordered.length < 5 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Restore removed Task image"
                    onPress={() => onRestore(image.taskImageId)}
                    style={styles.actionButton}
                  >
                    <Text style={styles.retryText}>Restore</Text>
                  </Pressable>
                ) : (
                  ordered.map((replacement, index) => (
                    <Pressable
                      key={replacement.taskImageId}
                      accessibilityRole="button"
                      accessibilityLabel={`Restore removed Task image by replacing image ${index + 1}`}
                      onPress={() => onRestore(image.taskImageId, replacement.taskImageId)}
                      style={styles.actionButton}
                    >
                      <Text style={styles.retryText}>Replace {index + 1}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = createThemedStyles({
  container: {
    gap: spacing.sm,
  },
  item: {
    minHeight: 84,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: 120,
  },
  stateText: {
    ...typography.micro,
    color: colors.textSecondary,
    padding: spacing.md,
  },
  captionInput: {
    width: "100%",
    minHeight: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: colors.textPrimary,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderSubtle,
  },
  captionText: {
    width: "100%",
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    color: colors.textSecondary,
    ...typography.micro,
  },
  actionRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
  },
  actionButton: {
    minWidth: 36,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: colors.bgFloating,
  },
  actionText: {
    color: colors.textPrimary,
    ...typography.bodyMd,
  },
  removeText: {
    color: colors.error,
    ...typography.micro,
  },
  sourceRow: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  sourceButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgFloating,
    alignItems: "center",
  },
  sourceButtonText: {
    ...typography.micro,
    color: colors.textPrimary,
  },
  retryButton: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.md,
    backgroundColor: colors.accentSoft,
  },
  retryText: {
    ...typography.micro,
    color: colors.accent,
  },
  recoverableSection: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.bgSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderSubtle,
  },
  recoverableHeading: {
    ...typography.micro,
    color: colors.textSecondary,
  },
  recoverableRow: {
    minHeight: 40,
    gap: spacing.sm,
  },
  recoverableActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  recoverableText: {
    flex: 1,
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  pressed: { opacity: 0.7 },
});
