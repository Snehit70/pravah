import { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AlertCircleIcon, ChevronLeftIcon, ChevronRightIcon, CloseIcon } from "./UiIcons";
import type { TaskImageFilmstripEntry } from "./TaskImageFilmstrip";
import { colors, radii, spacing, typography } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";

type DeliveryResult =
  | { kind: "ready"; url: string }
  | { kind: "not_found" }
  | { kind: "state"; state: string };

export type TaskImageViewerProps = {
  visible: boolean;
  images: TaskImageFilmstripEntry[];
  initialIndex: number;
  resolveDelivery?: (
    taskImageId: string,
    variant: "card" | "detail"
  ) => Promise<DeliveryResult>;
  onClose: () => void;
};

const MIN_SCALE = 1;
const DOUBLE_TAP_SCALE = 2;
const MAX_SCALE = 3;
const SWIPE_DISTANCE = 64;

function visualImages(images: TaskImageFilmstripEntry[]) {
  return images.filter((image) => image.state === "ready" || Boolean(image.previewUri));
}

export function hasTaskImageVisual(image: TaskImageFilmstripEntry) {
  return image.state === "ready" || Boolean(image.previewUri);
}

export function TaskImageViewer({
  visible,
  images,
  initialIndex,
  resolveDelivery,
  onClose,
}: TaskImageViewerProps) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, Math.min(initialIndex, images.length - 1)));
  const [delivery, setDelivery] = useState<DeliveryResult | null>(null);
  const scale = useSharedValue(MIN_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(MIN_SCALE);

  const activeImage = images[activeIndex];
  const count = images.length;

  useEffect(() => {
    if (!visible) return;
    setActiveIndex(Math.max(0, Math.min(initialIndex, images.length - 1)));
    scale.value = MIN_SCALE;
    savedScale.value = MIN_SCALE;
    translateX.value = 0;
    translateY.value = 0;
  }, [images, initialIndex, scale, savedScale, translateX, translateY, visible]);

  useEffect(() => {
    if (!visible || !activeImage) return;
    let active = true;
    setDelivery(null);
    if (activeImage.state !== "ready") {
      return () => {
        active = false;
      };
    }
    if (!resolveDelivery) {
      setDelivery({ kind: "not_found" });
      return () => {
        active = false;
      };
    }
    void resolveDelivery(activeImage.taskImageId, "detail")
      .then((result) => {
        if (active) setDelivery(result);
      })
      .catch(() => {
        if (active) setDelivery({ kind: "not_found" });
      });
    return () => {
      active = false;
    };
  }, [activeImage, resolveDelivery, visible]);

  const resetTransform = () => {
    scale.value = withTiming(MIN_SCALE);
    savedScale.value = MIN_SCALE;
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
  };

  const goTo = (nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= count || nextIndex === activeIndex) return;
    setActiveIndex(nextIndex);
    resetTransform();
  };

  const goPrevious = () => goTo(activeIndex - 1);
  const goNext = () => goTo(activeIndex + 1);

  const handleSwipe = (translationX: number) => {
    if (scale.value > MIN_SCALE + 0.05 || Math.abs(translationX) < SWIPE_DISTANCE) {
      translateX.value = withTiming(0);
      translateY.value = withTiming(0);
      return;
    }
    if (translationX < 0) goNext();
    else goPrevious();
  };

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((event) => {
          if (scale.value <= MIN_SCALE + 0.05) {
            translateX.value = event.translationX;
            return;
          }
          const maxX = Math.max(0, (width * (scale.value - MIN_SCALE)) / 2);
          const maxY = Math.max(0, (height * (scale.value - MIN_SCALE)) / 2);
          translateX.value = Math.max(-maxX, Math.min(maxX, event.translationX));
          translateY.value = Math.max(-maxY, Math.min(maxY, event.translationY));
        })
        .onEnd((event) => {
          runOnJS(handleSwipe)(event.translationX);
        }),
    [height, width, scale, translateX, translateY]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onUpdate((event) => {
          const nextScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * event.scale));
          scale.value = nextScale;
        })
        .onEnd(() => {
          savedScale.value = scale.value;
          if (scale.value <= MIN_SCALE + 0.05) {
            scale.value = withTiming(MIN_SCALE);
            savedScale.value = MIN_SCALE;
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
          }
        }),
    [savedScale, scale, translateX, translateY]
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd(() => {
          const nextScale = scale.value > MIN_SCALE + 0.05 ? MIN_SCALE : DOUBLE_TAP_SCALE;
          scale.value = withTiming(nextScale);
          savedScale.value = nextScale;
          if (nextScale === MIN_SCALE) {
            translateX.value = withTiming(0);
            translateY.value = withTiming(0);
          }
        }),
    [savedScale, scale, translateX, translateY]
  );

  const gesture = useMemo(() => Gesture.Simultaneous(pan, pinch, doubleTap), [doubleTap, pan, pinch]);
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!activeImage) return null;
  const localPreview = activeImage.state !== "ready" && activeImage.previewUri ? { uri: activeImage.previewUri } : null;
  const remoteImage = delivery?.kind === "ready" ? { uri: delivery.url } : null;
  const imageSource = localPreview ?? remoteImage;
  const unavailable = !imageSource && (
    activeImage.state !== "ready" ||
    delivery?.kind === "not_found" ||
    delivery?.kind === "state"
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={[styles.viewer, { paddingTop: Math.max(insets.top, spacing.lg), paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.topBar}>
            <Text style={styles.counter} accessibilityLabel={`Image ${activeIndex + 1} of ${count}`}>
              {activeIndex + 1} of {count}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close image viewer"
              onPress={onClose}
              style={styles.closeButton}
            >
              <CloseIcon color={colors.textInverse} size={22} />
            </Pressable>
          </View>

          <GestureDetector gesture={gesture}>
            <View style={styles.imageViewport} accessibilityLabel={`Task image ${activeIndex + 1} of ${count}`}>
              {imageSource ? (
                <Animated.View style={[styles.imageStage, imageStyle]}>
                  <Image
                    source={imageSource}
                    style={styles.image}
                    contentFit="contain"
                    cachePolicy="memory"
                    accessibilityRole="image"
                    accessibilityLabel={`Task image ${activeIndex + 1} of ${count}`}
                  />
                </Animated.View>
              ) : (
                <View style={styles.unavailableState}>
                  {unavailable ? <AlertCircleIcon color={colors.textInverse} size={22} /> : null}
                  <Text style={styles.stateTitle}>{unavailable ? "Image unavailable" : "Loading image"}</Text>
                  <Text style={styles.stateBody}>{unavailable ? "Close this viewer to retry from the Task." : "Preparing the private image…"}</Text>
                </View>
              )}
            </View>
          </GestureDetector>

          <View style={styles.bottomBar}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Previous Task image"
              disabled={activeIndex === 0}
              onPress={goPrevious}
              style={[styles.navigationButton, activeIndex === 0 && styles.navigationDisabled]}
            >
              <ChevronLeftIcon color={colors.textInverse} size={24} />
            </Pressable>
            <Text style={styles.hint}>Pinch to zoom</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Next Task image"
              disabled={activeIndex === count - 1}
              onPress={goNext}
              style={[styles.navigationButton, activeIndex === count - 1 && styles.navigationDisabled]}
            >
              <ChevronRightIcon color={colors.textInverse} size={24} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = createThemedStyles({
  backdrop: { flex: 1, backgroundColor: "rgba(8, 5, 10, 0.94)" },
  viewer: { flex: 1, paddingHorizontal: spacing.md, justifyContent: "space-between" },
  topBar: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  counter: { ...typography.bodySm, color: colors.textInverse },
  closeButton: { width: 48, height: 48, borderRadius: radii.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,250,242,0.12)" },
  imageViewport: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  imageStage: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  unavailableState: { maxWidth: 280, alignItems: "center", gap: spacing.sm },
  stateTitle: { ...typography.title, color: colors.textInverse, textAlign: "center" },
  stateBody: { ...typography.bodySm, color: "rgba(255,250,242,0.74)", textAlign: "center" },
  bottomBar: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navigationButton: { width: 48, height: 48, borderRadius: radii.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,250,242,0.12)" },
  navigationDisabled: { opacity: 0.35 },
  hint: { ...typography.metadata, color: "rgba(255,250,242,0.72)" },
});

export function getViewerImages(images: TaskImageFilmstripEntry[]) {
  return visualImages(images);
}
