import { Image, StyleSheet } from "react-native";

type BrandMarkProps = {
  size?: number;
};

const ICON_SOURCE = require("../../assets/icon.png");

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

const styles = StyleSheet.create({
  mark: {
    overflow: "hidden",
  },
});
