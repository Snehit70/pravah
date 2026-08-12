import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { Image } from "expo-image";
import { Gesture, GestureDetector, GestureHandlerRootView } from "react-native-gesture-handler";
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
import { haptic } from "../lib/haptic";
import { useReducedMotion } from "../hooks/useReducedMotion";
import {
  DOUBLE_TAP_VIEWER_SCALE,
  MAX_VIEWER_SCALE,
  MIN_VIEWER_SCALE,
  clampViewerTranslation,
  zoomViewerAtPoint,
} from "../lib/taskImageViewerTransform";

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

const SWIPE_DISTANCE = 64;
const DISMISS_DISTANCE = 96;
const CHROME_HIDE_MS = 2_500;

function visualImages(images: TaskImageFilmstripEntry[]) {
  return images.filter((image) => image.state === "ready" || Boolean(image.previewUri));
}

// eslint-disable-next-line react-refresh/only-export-components
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
  const reducedMotion = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [measuredViewport, setMeasuredViewport] = useState({ width: 0, height: 0 });
  const viewportWidth = measuredViewport.width || width;
  const viewportHeight = measuredViewport.height || height;
  const [activeIndex, setActiveIndex] = useState(() => Math.max(0, Math.min(initialIndex, images.length - 1)));
  const [delivery, setDelivery] = useState<{ imageId: string; result: DeliveryResult } | null>(null);
  const [deliveryAttempt, setDeliveryAttempt] = useState(0);
  const [chromeVisible, setChromeVisible] = useState(true);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const activeImageIdRef = useRef<string | undefined>(images[activeIndex]?.taskImageId);
  const deliveryRequest = useRef<{ active: boolean } | null>(null);
  const scale = useSharedValue(MIN_VIEWER_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(MIN_VIEWER_SCALE);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const pinchOriginX = useSharedValue(0);
  const pinchOriginY = useSharedValue(0);

  const activeImage = images[activeIndex];
  const count = images.length;
  const contentAspectRatio = activeImage?.presentation?.aspectRatio
    ?? (activeImage?.presentation?.width && activeImage.presentation.height
      ? activeImage.presentation.width / activeImage.presentation.height
      : viewportWidth / viewportHeight);

  useEffect(() => {
    if (!visible) return;
    const preservedIndex = activeImageIdRef.current
      ? images.findIndex((image) => image.taskImageId === activeImageIdRef.current)
      : -1;
    const nextIndex = preservedIndex >= 0
      ? preservedIndex
      : Math.max(0, Math.min(initialIndex, images.length - 1));
    setActiveIndex(nextIndex);
    activeImageIdRef.current = images[nextIndex]?.taskImageId;
    scale.set(MIN_VIEWER_SCALE);
    savedScale.set(MIN_VIEWER_SCALE);
    translateX.set(0);
    translateY.set(0);
    savedTranslateX.set(0);
    savedTranslateY.set(0);
    setChromeVisible(true);
    setCaptionExpanded(false);
  }, [images, initialIndex, scale, savedScale, savedTranslateX, savedTranslateY, translateX, translateY, visible]);

  useEffect(() => {
    if (!visible || !chromeVisible || captionExpanded) return;
    const timer = setTimeout(() => setChromeVisible(false), CHROME_HIDE_MS);
    return () => clearTimeout(timer);
  }, [activeIndex, captionExpanded, chromeVisible, visible]);

  useEffect(() => {
    if (!visible || !activeImage) return;
    const request = { active: true };
    deliveryRequest.current = request;
    if (activeImage.state !== "ready") {
      return () => {
        request.active = false;
        if (deliveryRequest.current === request) deliveryRequest.current = null;
      };
    }
    if (!resolveDelivery) {
      setDelivery({ imageId: activeImage.taskImageId, result: { kind: "not_found" } });
      return () => {
        request.active = false;
        if (deliveryRequest.current === request) deliveryRequest.current = null;
      };
    }
    void resolveDelivery(activeImage.taskImageId, "detail")
      .then((result) => {
        if (request.active) setDelivery({ imageId: activeImage.taskImageId, result });
      })
      .catch(() => {
        if (request.active) setDelivery({ imageId: activeImage.taskImageId, result: { kind: "not_found" } });
      });
    return () => {
      request.active = false;
      if (deliveryRequest.current === request) deliveryRequest.current = null;
    };
  }, [activeImage, deliveryAttempt, resolveDelivery, visible]);

  useEffect(() => {
    if (!visible || !resolveDelivery) return;
    let active = true;
    const adjacent = [images[activeIndex - 1], images[activeIndex + 1]].filter(
      (image): image is TaskImageFilmstripEntry => Boolean(image && image.state === "ready"),
    );
    for (const image of adjacent) {
      void resolveDelivery(image.taskImageId, "detail").then((result) => {
        if (active && result.kind === "ready" && typeof Image.prefetch === "function") {
          void Image.prefetch(result.url, "memory");
        }
      }).catch(() => undefined);
    }
    return () => { active = false; };
  }, [activeIndex, images, resolveDelivery, visible]);

  const resetTransform = useCallback(() => {
    scale.set(withTiming(MIN_VIEWER_SCALE, { duration: reducedMotion ? 0 : 180 }));
    savedScale.set(MIN_VIEWER_SCALE);
    translateX.set(withTiming(0, { duration: reducedMotion ? 0 : 180 }));
    translateY.set(withTiming(0, { duration: reducedMotion ? 0 : 180 }));
    savedTranslateX.set(0);
    savedTranslateY.set(0);
  }, [reducedMotion, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

  const goTo = useCallback((nextIndex: number) => {
    if (nextIndex < 0 || nextIndex >= count || nextIndex === activeIndex) return;
    setActiveIndex(nextIndex);
    activeImageIdRef.current = images[nextIndex]?.taskImageId;
    setCaptionExpanded(false);
    setChromeVisible(true);
    resetTransform();
    haptic.selection();
    void AccessibilityInfo.announceForAccessibility?.(`Image ${nextIndex + 1} of ${count}${nextIndex === 0 ? ", Primary" : ""}`);
  }, [activeIndex, count, images, resetTransform]);

  const goPrevious = () => goTo(activeIndex - 1);
  const goNext = () => goTo(activeIndex + 1);
  const toggleChrome = useCallback(() => setChromeVisible((current) => !current), []);
  const completePageTransition = useCallback((nextIndex: number, entryDirection: number) => {
    setActiveIndex(nextIndex);
    activeImageIdRef.current = images[nextIndex]?.taskImageId;
    setCaptionExpanded(false);
    setChromeVisible(true);
    scale.set(MIN_VIEWER_SCALE);
    savedScale.set(MIN_VIEWER_SCALE);
    translateY.set(0);
    savedTranslateX.set(0);
    savedTranslateY.set(0);
    translateX.set(entryDirection * viewportWidth);
    translateX.set(withTiming(0, { duration: 190 }));
    haptic.selection();
    void AccessibilityInfo.announceForAccessibility?.(`Image ${nextIndex + 1} of ${count}${nextIndex === 0 ? ", Primary" : ""}`);
  }, [count, images, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY, viewportWidth]);

  const handleSwipe = useCallback((translationX: number) => {
    if (scale.value > MIN_VIEWER_SCALE + 0.05 || Math.abs(translationX) < SWIPE_DISTANCE) {
      resetTransform();
      return;
    }
    const nextIndex = translationX < 0 ? activeIndex + 1 : activeIndex - 1;
    if (nextIndex < 0 || nextIndex >= count) {
      resetTransform();
      return;
    }
    if (reducedMotion) {
      goTo(nextIndex);
      return;
    }
    translateX.set(withTiming(translationX < 0 ? -viewportWidth : viewportWidth, { duration: 160 }, (finished) => {
      if (finished) runOnJS(completePageTransition)(nextIndex, translationX < 0 ? 1 : -1);
    }));
  }, [activeIndex, completePageTransition, count, goTo, reducedMotion, resetTransform, scale, translateX, viewportWidth]);

  const finishPan = useCallback((translationXValue: number, translationYValue: number) => {
    if (scale.value > MIN_VIEWER_SCALE + 0.05) {
      const bounded = clampViewerTranslation({
        scale: scale.value,
        translateX: savedTranslateX.value + translationXValue,
        translateY: savedTranslateY.value + translationYValue,
      }, { width: viewportWidth, height: viewportHeight, contentAspectRatio });
      translateX.set(withTiming(bounded.translateX, { duration: reducedMotion ? 0 : 180 }));
      translateY.set(withTiming(bounded.translateY, { duration: reducedMotion ? 0 : 180 }));
      savedTranslateX.set(bounded.translateX);
      savedTranslateY.set(bounded.translateY);
      return;
    }
    if (Math.abs(translationYValue) > DISMISS_DISTANCE && Math.abs(translationYValue) > Math.abs(translationXValue)) {
      onClose();
      return;
    }
    handleSwipe(translationXValue);
  }, [contentAspectRatio, handleSwipe, onClose, reducedMotion, savedTranslateX, savedTranslateY, scale, translateX, translateY, viewportHeight, viewportWidth]);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(8)
        .onUpdate((event) => {
          if (scale.value <= MIN_VIEWER_SCALE + 0.05) {
            const pagingPastStart = activeIndex === 0 && event.translationX > 0;
            const pagingPastEnd = activeIndex === count - 1 && event.translationX < 0;
            translateX.value = event.translationX * (pagingPastStart || pagingPastEnd ? 0.22 : 1);
            translateY.value = reducedMotion ? 0 : event.translationY;
            return;
          }
          translateX.value = savedTranslateX.value + event.translationX;
          translateY.value = savedTranslateY.value + event.translationY;
        })
        .onEnd((event) => {
          runOnJS(finishPan)(event.translationX, event.translationY);
        }),
    [activeIndex, count, finishPan, reducedMotion, savedTranslateX, savedTranslateY, scale, translateX, translateY]
  );

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((event) => {
          pinchOriginX.value = event.focalX;
          pinchOriginY.value = event.focalY;
        })
        .onUpdate((event) => {
          const nextScale = Math.max(MIN_VIEWER_SCALE, Math.min(MAX_VIEWER_SCALE, savedScale.value * event.scale));
          const ratio = nextScale / savedScale.value;
          const centeredX = pinchOriginX.value - viewportWidth / 2;
          const centeredY = pinchOriginY.value - viewportHeight / 2;
          scale.value = nextScale;
          const bounded = clampViewerTranslation({
            scale: nextScale,
            translateX: savedTranslateX.value * ratio + centeredX * (1 - ratio),
            translateY: savedTranslateY.value * ratio + centeredY * (1 - ratio),
          }, { width: viewportWidth, height: viewportHeight, contentAspectRatio });
          translateX.value = bounded.translateX;
          translateY.value = bounded.translateY;
        })
        .onEnd(() => {
          savedScale.value = scale.value;
          savedTranslateX.value = translateX.value;
          savedTranslateY.value = translateY.value;
        }),
    [contentAspectRatio, pinchOriginX, pinchOriginY, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY, viewportHeight, viewportWidth]
  );

  const doubleTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .onEnd((event) => {
          const nextScale = scale.value > MIN_VIEWER_SCALE + 0.05 ? MIN_VIEWER_SCALE : DOUBLE_TAP_VIEWER_SCALE;
          const next = zoomViewerAtPoint(
            { scale: scale.value, translateX: translateX.value, translateY: translateY.value },
            nextScale,
            { x: event.x, y: event.y },
            { width: viewportWidth, height: viewportHeight, contentAspectRatio },
          );
          scale.value = withTiming(nextScale, { duration: reducedMotion ? 0 : 180 });
          savedScale.value = next.scale;
          translateX.value = withTiming(next.translateX, { duration: reducedMotion ? 0 : 180 });
          translateY.value = withTiming(next.translateY, { duration: reducedMotion ? 0 : 180 });
          savedTranslateX.value = next.translateX;
          savedTranslateY.value = next.translateY;
        }),
    [contentAspectRatio, reducedMotion, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY, viewportHeight, viewportWidth]
  );

  const singleTap = useMemo(() => Gesture.Tap().numberOfTaps(1).onEnd(() => {
    runOnJS(toggleChrome)();
  }), [toggleChrome]);

  const gesture = useMemo(
    () => Gesture.Simultaneous(pan, pinch, Gesture.Exclusive(doubleTap, singleTap)),
    [doubleTap, pan, pinch, singleTap],
  );
  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const setZoom = useCallback((nextScale: number) => {
    const next = zoomViewerAtPoint(
      { scale: scale.value, translateX: translateX.value, translateY: translateY.value },
      nextScale,
      { x: viewportWidth / 2, y: viewportHeight / 2 },
      { width: viewportWidth, height: viewportHeight, contentAspectRatio },
    );
    scale.set(withTiming(next.scale, { duration: reducedMotion ? 0 : 180 }));
    savedScale.set(next.scale);
    translateX.set(withTiming(next.translateX, { duration: reducedMotion ? 0 : 180 }));
    translateY.set(withTiming(next.translateY, { duration: reducedMotion ? 0 : 180 }));
    savedTranslateX.set(next.translateX);
    savedTranslateY.set(next.translateY);
  }, [contentAspectRatio, reducedMotion, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY, viewportHeight, viewportWidth]);

  if (!activeImage) return null;
  const localPreview = activeImage.state !== "ready" && activeImage.previewUri ? { uri: activeImage.previewUri } : null;
  const activeDelivery = delivery?.imageId === activeImage.taskImageId ? delivery.result : null;
  const remoteImage = activeDelivery?.kind === "ready" ? { uri: activeDelivery.url } : null;
  const imageSource = localPreview ?? remoteImage;
  const unavailable = !imageSource && (
    activeImage.state !== "ready" ||
    activeDelivery?.kind === "not_found" ||
    activeDelivery?.kind === "state"
  );
  const counterText = `${activeIndex + 1} of ${count}${activeIndex === 0 ? " · Primary" : ""}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={[styles.viewer, { paddingTop: Math.max(insets.top, spacing.lg), paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {chromeVisible ? <View style={styles.topBar}>
            <Text style={styles.counter} accessibilityLabel={`Image ${activeIndex + 1} of ${count}${activeIndex === 0 ? ", Primary" : ""}`}>
              {counterText}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close image viewer"
              onPress={onClose}
              style={styles.closeButton}
            >
              <CloseIcon color={colors.textInverse} size={22} />
            </Pressable>
          </View> : <View style={styles.topBarPlaceholder} />}

          <GestureDetector gesture={gesture}>
            <View
              style={styles.imageViewport}
              onLayout={(event) => {
                const { width: nextWidth, height: nextHeight } = event.nativeEvent.layout;
                setMeasuredViewport((current) => current.width === nextWidth && current.height === nextHeight
                  ? current
                  : { width: nextWidth, height: nextHeight });
              }}
              accessibilityRole="adjustable"
              accessibilityLabel={`Task image ${activeIndex + 1} of ${count}${activeIndex === 0 ? ", Primary" : ""}`}
              accessibilityHint="Swipe left or right to change images. Use accessibility actions to zoom."
              accessibilityActions={[
                ...(activeIndex > 0 ? [{ name: "previousImage", label: "Previous image" }] : []),
                ...(activeIndex < count - 1 ? [{ name: "nextImage", label: "Next image" }] : []),
                { name: "zoomIn", label: "Zoom in" },
                { name: "zoomOut", label: "Zoom out" },
                { name: "resetZoom", label: "Reset zoom" },
                { name: "closeViewer", label: "Close" },
              ]}
              onAccessibilityAction={(event) => {
                if (event.nativeEvent.actionName === "previousImage") goPrevious();
                if (event.nativeEvent.actionName === "nextImage") goNext();
                if (event.nativeEvent.actionName === "zoomIn") setZoom(Math.min(MAX_VIEWER_SCALE, scale.value + 1));
                if (event.nativeEvent.actionName === "zoomOut") setZoom(Math.max(MIN_VIEWER_SCALE, scale.value - 1));
                if (event.nativeEvent.actionName === "resetZoom") setZoom(MIN_VIEWER_SCALE);
                if (event.nativeEvent.actionName === "closeViewer") onClose();
              }}
            >
              {imageSource ? (
                <Animated.View style={[styles.imageStage, imageStyle]}>
                  <Image
                    source={imageSource}
                    style={styles.image}
                    contentFit="contain"
                    cachePolicy="memory"
                    accessibilityRole="image"
                    accessibilityLabel={`Task image ${activeIndex + 1} of ${count}${activeIndex === 0 ? ", Primary" : ""}`}
                  />
                </Animated.View>
              ) : (
                <View style={styles.unavailableState}>
                  {unavailable ? <AlertCircleIcon color={colors.textInverse} size={22} /> : null}
                  <Text style={styles.stateTitle}>{unavailable ? "Image unavailable" : "Loading image"}</Text>
                  <Text style={styles.stateBody}>{unavailable ? "The private image could not be loaded." : "Preparing the private image…"}</Text>
                  {unavailable ? <Pressable accessibilityRole="button" accessibilityLabel="Retry loading Task image" onPress={() => {
                    setDelivery(null);
                    setDeliveryAttempt((attempt) => attempt + 1);
                  }} style={styles.retryButton}><Text style={styles.retryText}>Retry</Text></Pressable> : null}
                </View>
              )}
            </View>
          </GestureDetector>

          {chromeVisible ? <View style={styles.bottomChrome}>
            {activeImage.caption ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={captionExpanded ? "Collapse image caption" : "Expand image caption"}
                accessibilityState={{ expanded: captionExpanded }}
                onPress={() => setCaptionExpanded((expanded) => !expanded)}
                style={styles.captionPanel}
              >
                <ScrollView style={captionExpanded ? styles.captionScrollExpanded : styles.captionScroll} nestedScrollEnabled>
                  <Text numberOfLines={captionExpanded ? undefined : 2} style={styles.captionText}>{activeImage.caption}</Text>
                </ScrollView>
              </Pressable>
            ) : null}
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
            <Text style={styles.hint}>{reducedMotion ? "Zoom and swipe" : "Pinch, double-tap, or swipe"}</Text>
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
          </View> : <View style={styles.bottomBarPlaceholder} />}
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = createThemedStyles({
  gestureRoot: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(8, 5, 10, 0.94)" },
  viewer: { flex: 1, paddingHorizontal: spacing.md, justifyContent: "space-between" },
  topBar: { minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  topBarPlaceholder: { minHeight: 48 },
  counter: { ...typography.bodyMd, color: colors.textInverse },
  closeButton: { width: 48, height: 48, borderRadius: radii.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,250,242,0.12)" },
  imageViewport: { flex: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  imageStage: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%" },
  unavailableState: { maxWidth: 280, alignItems: "center", gap: spacing.sm },
  stateTitle: { ...typography.title, color: colors.textInverse, textAlign: "center" },
  stateBody: { ...typography.bodyMd, color: "rgba(255,250,242,0.74)", textAlign: "center" },
  retryButton: { minWidth: 88, minHeight: 44, marginTop: spacing.sm, alignItems: "center", justifyContent: "center", borderRadius: radii.md, backgroundColor: "rgba(255,250,242,0.14)" },
  retryText: { ...typography.title, color: colors.textInverse },
  bottomChrome: { gap: spacing.sm },
  captionPanel: { alignSelf: "center", width: "100%", maxWidth: 640, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.lg, backgroundColor: "rgba(8,5,10,0.72)" },
  captionScroll: { maxHeight: 48 },
  captionScrollExpanded: { maxHeight: 180 },
  captionText: { ...typography.bodyMd, color: colors.textInverse, textAlign: "center" },
  bottomBar: { minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  bottomBarPlaceholder: { minHeight: 56 },
  navigationButton: { width: 48, height: 48, borderRadius: radii.full, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,250,242,0.12)" },
  navigationDisabled: { opacity: 0.35 },
  hint: { ...typography.micro, color: "rgba(255,250,242,0.72)" },
});

// eslint-disable-next-line react-refresh/only-export-components
export function getViewerImages(images: TaskImageFilmstripEntry[]) {
  return visualImages(images);
}
