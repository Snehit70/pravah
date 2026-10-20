import { useCallback, useState, type ReactNode } from "react";
import {
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { colors, spacing } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";

export type ScrollbarOptions = {
  indicatorColor?: string;
  /** Space occupied by a floating tab bar or action dock. */
  indicatorBottomInset?: number;
};

type ScrollbarFrameProps = ScrollbarOptions & Pick<
  ScrollViewProps, "onLayout" | "onContentSizeChange" | "onScroll"
> & {
  style?: StyleProp<ViewStyle>;
  children: (handlers: {
    onScroll: NonNullable<ScrollViewProps["onScroll"]> | ReturnType<typeof useAnimatedScrollHandler>;
    onContentSizeChange: (width: number, height: number) => void;
  }) => ReactNode;
};

/** Shared overflow measurement and persistent rail for vertical scroll surfaces. */
export function ScrollbarFrame({
  children, style, indicatorColor = colors.accent, indicatorBottomInset = 0,
  onLayout, onContentSizeChange, onScroll,
}: ScrollbarFrameProps) {
  const scrollY = useSharedValue(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  const handleContentSizeChange = useCallback((width: number, height: number) => {
    setContentHeight(height);
    onContentSizeChange?.(width, height);
  }, [onContentSizeChange]);

  const animatedOnScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      "worklet";
      scrollY.set(event.contentOffset.y);
    },
  });

  // Settings needs the original JS event to preserve each route's position.
  const handleJSScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.set(event.nativeEvent.contentOffset.y);
    onScroll?.(event);
  }, [onScroll, scrollY]);

  const bottomInset = Math.max(0, indicatorBottomInset);
  const trackHeight = Math.max(0, viewportHeight - spacing.xs * 2 - bottomInset);
  const canScroll = contentHeight > viewportHeight + 1 && trackHeight > 0;
  const thumbHeight = canScroll
    ? Math.min(trackHeight, Math.max(36, trackHeight * viewportHeight / contentHeight))
    : 0;
  const scrollRange = Math.max(1, contentHeight - viewportHeight);
  const thumbTravel = Math.max(0, trackHeight - thumbHeight);
  const thumbAnimation = useAnimatedStyle(() => {
    "worklet";
    const progress = Math.min(1, Math.max(0, scrollY.get() / scrollRange));
    return { transform: [{ translateY: progress * thumbTravel }] };
  }, [scrollRange, scrollY, thumbTravel]);

  return (
    <View
      style={[styles.container, style]}
      onLayout={(event) => {
        setViewportHeight(event.nativeEvent.layout.height);
        onLayout?.(event);
      }}
    >
      {children({
        onScroll: onScroll ? handleJSScroll : animatedOnScroll,
        onContentSizeChange: handleContentSizeChange,
      })}
      {canScroll ? (
        <View
          pointerEvents="none"
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[styles.track, { bottom: spacing.xs + bottomInset }]}
        >
          <Animated.View style={[
            styles.thumb,
            { height: thumbHeight, backgroundColor: indicatorColor },
            thumbAnimation,
          ]} />
        </View>
      ) : null}
    </View>
  );
}

const styles = createThemedStyles({
  container: { flexGrow: 1, flexShrink: 1, minHeight: 0, position: "relative" },
  track: {
    position: "absolute", top: spacing.xs, right: 4, zIndex: 1, elevation: 1,
    width: 4, overflow: "hidden", borderRadius: 3, backgroundColor: colors.border,
  },
  thumb: { width: "100%", borderRadius: 3 },
});
