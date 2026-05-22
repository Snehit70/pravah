import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { haptic } from "../lib/haptic";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, fonts, radii, shadow } from "../theme/tokens";

type FABProps = {
  onPress: () => void;
  bottom?: number;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Capture pill. Replaces the green circle FAB. Three things matter:
 *   1. Shape \u2014 pill, not circle. The "+ Capture" label gives it a verb,
 *      which a circle alone never could.
 *   2. Color \u2014 warm ink (textPrimary) on dark background. Copper is reserved
 *      for urgency signals (P1, active tab); using it on the FAB would
 *      conflate "here's the action" with "this is urgent."
 *   3. Halo \u2014 two stacked View layers behind the pill at low alpha do the
 *      work of a real halo. RN can't blur a View, so we get the soft glow
 *      from layered scale + alpha, plus a shadow underneath.
 */
function FABInner({ onPress, bottom = 92 }: FABProps) {
  const scale = useSharedValue(1);

  const pressableStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    // Spring down to 0.96 — just enough to feel responsive without making
    // the pill jump. damping high so it doesn't overshoot.
    scale.set(withSpring(0.96, { damping: 18, stiffness: 320 }));
  };

  const handlePressOut = () => {
    scale.set(withSpring(1, { damping: 18, stiffness: 320 }));
  };

  const handlePress = () => {
    haptic.medium();
    onPress();
  };

  return (
    <View style={[styles.container, { bottom }]} pointerEvents="box-none">
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.pill, pressableStyle]}
        accessibilityRole="button"
        accessibilityLabel="Capture a new task"
      >
        {/* 1px top inner highlight \u2014 fakes web Button primary's
            box-shadow inset 0 1px 0 0 rgba(255,255,255,0.08). */}
        <View pointerEvents="none" style={styles.innerHighlight} />
        <Text style={styles.plus}>+</Text>
        <Text style={styles.label}>Capture</Text>
      </AnimatedPressable>
    </View>
  );
}

export const FAB = memo(FABInner);

const PILL_HEIGHT = 48;

const styles = StyleSheet.create({
  // Bottom-right anchor; horizontal margin matches the list's right edge so
  // the pill aligns with the content column rather than floating in space.
  container: {
    position: "absolute",
    right: 20,
    zIndex: 50,
    elevation: 50,
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: PILL_HEIGHT,
    paddingHorizontal: 20,
    borderRadius: radii.full,
    backgroundColor: colors.accent,
    ...shadow.glow,
    gap: 6,
    overflow: "hidden",
  },
  // Top hairline highlight \u2014 gives the pill the same "lit from above" lift
  // as the web Button primary's inset 1px shadow.
  innerHighlight: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  plus: {
    color: colors.textInverse,
    fontFamily: fonts.sansBold,
    fontSize: 17,
    lineHeight: 18,
  },
  label: {
    color: colors.textInverse,
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    letterSpacing: 0.4,
  },
});
