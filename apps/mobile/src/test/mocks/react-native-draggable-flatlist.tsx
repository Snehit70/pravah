import type { ReactNode } from "react";
import { View } from "react-native";

type Props<T> = {
  data: T[];
  renderItem: (params: {
    item: T;
    drag: () => void;
    isActive: boolean;
    getIndex: () => number;
  }) => ReactNode;
  ListFooterComponent?: ReactNode;
  onDragBegin?: (index: number) => void;
  onDragEnd?: (params: { data: T[]; from: number; to: number }) => void;
};

export default function DraggableFlatList<T>({
  data,
  renderItem,
  ListFooterComponent,
  onDragBegin,
  onDragEnd,
}: Props<T>) {
  return (
    <View>
      {data.map((item, index) => renderItem({
        item,
        drag: () => {
          onDragBegin?.(index);
          const reordered = [...data];
          const [moved] = reordered.splice(index, 1);
          const to = index === 0 ? reordered.length : 0;
          reordered.splice(to, 0, moved);
          onDragEnd?.({ data: reordered, from: index, to });
        },
        isActive: false,
        getIndex: () => index,
      }))}
      {ListFooterComponent}
    </View>
  );
}
