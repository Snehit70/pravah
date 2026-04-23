import { memo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { colors, fonts, radii } from "../theme/tokens";

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
    // Spring down to 0.96 \u2014 just enough to feel responsive without making
    // the pill jump. damping high so it doesn't overshoot.
    scale.value = withSpring(0.96, { damping: 18, stiffness: 320 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 18, stiffness: 320 });
  };

  const handlePress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  return (
    <View style={[styles.container, { bottom }]} pointerEvents="box-none">
      {/* Two halo layers \u2014 the wider one is dimmer, the inner one a bit brighter.
          Both are non-interactive so taps fall through to the pill. */}
      <View style={[styles.halo, styles.haloOuter]} pointerEvents="none" />
      <View style={[styles.halo, styles.haloInner]} pointerEvents="none" />
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.pill, pressableStyle]}
        accessibilityRole="button"
        accessibilityLabel="Capture a new task"
      >
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
  // Two stacked halo layers create the soft-edge feel. The outer layer is
  // larger and dimmer; the inner is closer and brighter. Both inherit the
  // pill's pill shape via radii.full so the halo follows the silhouette.
  halo: {
    position: "absolute",
    borderRadius: radii.full,
    backgroundColor: colors.accentSoft,
  },
  haloOuter: {
    top: -16,
    left: -16,
    right: -16,
    bottom: -16,
    opacity: 0.5,
  },
  haloInner: {
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    opacity: 0.8,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: PILL_HEIGHT,
    paddingHorizontal: 20,
    borderRadius: radii.full,
    backgroundColor: colors.textPrimary,
    // Real shadow \u2014 not the broken green rectangle we had before. The shadow
    // sits below the pill so it reads as elevated above the list.
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 14,
    gap: 6,
  },
  plus: {
    color: colors.bg,
    fontFamily: fonts.sansBold,
    fontSize: 17,
    lineHeight: 18,
  },
  label: {
    color: colors.bg,
    fontFamily: fonts.sansSemibold,
    fontSize: 14,
    letterSpacing: 0.6,
  },
});
