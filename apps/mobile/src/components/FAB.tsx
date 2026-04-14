import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, radii } from "../theme/tokens";

type FABProps = {
  onPress: () => void;
  bottom?: number;
};

function FABInner({ onPress, bottom = 92 }: FABProps) {
  return (
    <View style={[styles.container, { bottom }]} pointerEvents="box-none">
      <View style={styles.glow} pointerEvents="none" />
      <Pressable
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onPress();
        }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.icon}>+</Text>
      </Pressable>
    </View>
  );
}

export const FAB = memo(FABInner);

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    right: 20,
    zIndex: 50,
    elevation: 50,
  },
  glow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    backgroundColor: colors.primary,
    transform: [{ scale: 1.4 }],
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    elevation: 8,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  pressed: {
    opacity: 0.9,
  },
  icon: {
    color: colors.primaryDark,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 30,
  },
});
