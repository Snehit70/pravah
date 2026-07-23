import { Image } from "react-native";
import { createThemedStyles } from "../theme/themeRuntime";
import ICON_SOURCE from "../../assets/icon.png";

type BrandMarkProps = {
  size?: number;
};

export function BrandMark({ size = 22 }: BrandMarkProps) {
  return (
    <Image
      source={ICON_SOURCE}
      style={[styles.mark, { width: size, height: size, borderRadius: Math.round(size * 0.22) }]}
      accessibilityIgnoresInvertColors
      resizeMode="cover"
    />
  );
}

const styles = createThemedStyles({
  mark: {
    overflow: "hidden",
  },
});
