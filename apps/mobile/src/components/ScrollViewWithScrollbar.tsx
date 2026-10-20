import { forwardRef } from "react";
import type { ScrollView, ScrollViewProps } from "react-native";
import Animated from "react-native-reanimated";
import { ScrollbarFrame, type ScrollbarOptions } from "./ScrollbarFrame";

type ScrollViewWithScrollbarProps = Omit<ScrollViewProps, "horizontal"> & ScrollbarOptions;

/** Vertical ScrollView with a persistent rail only when content overflows. */
export const ScrollViewWithScrollbar = forwardRef<ScrollView, ScrollViewWithScrollbarProps>(
  function ScrollViewWithScrollbar({
    children, style, indicatorColor, indicatorBottomInset,
    onLayout, onContentSizeChange, onScroll,
    scrollEventThrottle = 16, ...scrollViewProps
  }, ref) {
    return (
      <ScrollbarFrame
        style={style}
        indicatorColor={indicatorColor}
        indicatorBottomInset={indicatorBottomInset}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
      >
        {(handlers) => (
          <Animated.ScrollView
            {...scrollViewProps}
            {...handlers}
            ref={ref}
            style={scrollStyle}
            scrollEventThrottle={scrollEventThrottle}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </Animated.ScrollView>
        )}
      </ScrollbarFrame>
    );
  },
);

const scrollStyle = { flexGrow: 1, flexShrink: 1 };
