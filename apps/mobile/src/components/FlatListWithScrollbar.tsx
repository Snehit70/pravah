import { forwardRef, type ForwardedRef, type ReactElement, type RefAttributes } from "react";
import type { FlatList, FlatListProps } from "react-native";
import Animated from "react-native-reanimated";
import { ScrollbarFrame, type ScrollbarOptions } from "./ScrollbarFrame";

type FlatListWithScrollbarProps<ItemT> = Omit<
  FlatListProps<ItemT>, "horizontal" | "CellRendererComponent"
> & ScrollbarOptions;

function FlatListWithScrollbarInner<ItemT>({
  style, indicatorColor, indicatorBottomInset, onLayout, onContentSizeChange, onScroll,
  scrollEventThrottle = 16, ...listProps
}: FlatListWithScrollbarProps<ItemT>, ref: ForwardedRef<FlatList<ItemT>>) {
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
        <Animated.FlatList<ItemT>
          {...listProps}
          {...handlers}
          ref={ref}
          style={listStyle}
          scrollEventThrottle={scrollEventThrottle}
          showsVerticalScrollIndicator={false}
        />
      )}
    </ScrollbarFrame>
  );
}

/** Preserves FlatList virtualization, refs, and refresh controls with the shared rail. */
export const FlatListWithScrollbar = forwardRef(FlatListWithScrollbarInner) as <ItemT>(
  props: FlatListWithScrollbarProps<ItemT> & RefAttributes<FlatList<ItemT>>,
) => ReactElement;

const listStyle = { flexGrow: 1, flexShrink: 1 };
