import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { colors } from "../theme/tokens";
import { createThemedStyles } from "../theme/themeRuntime";
import { useReducedMotion } from "../hooks/useReducedMotion";

const RINGS = [0, 1, 2, 3];
const BASE_SIZE = 80;
const MAX_SIZE = 340;
const CYCLE_MS = 3200;
const STAGGER_MS = CYCLE_MS / RINGS.length;

function Ring({ index, disabled }: { index: number; disabled: boolean }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (disabled) {
      progress.value = 0;
      return;
    }
    progress.value = withDelay(
      index * STAGGER_MS,
      withRepeat(
        withTiming(1, { duration: CYCLE_MS, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      ),
    );
  }, [disabled, index, progress]);

  const animStyle = useAnimatedStyle(() => {
    const size = BASE_SIZE + progress.value * (MAX_SIZE - BASE_SIZE);
    const opacity = (1 - progress.value) * 0.22;
    return {
      width: size,
      height: size,
      borderRadius: size / 2,
      opacity,
      transform: [{ translateX: -size / 2 }, { translateY: -size / 2 }],
    };
  });

  return <Animated.View style={[styles.ring, animStyle]} />;
}

type RippleRingsProps = {
  /** Center X relative to parent */
  cx: number;
  /** Center Y relative to parent */
  cy: number;
};

export function RippleRings({ cx, cy }: RippleRingsProps) {
  const reducedMotion = useReducedMotion();

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.origin, { left: cx, top: cy }]}>
        {RINGS.map((i) => (
          <Ring key={i} index={i} disabled={reducedMotion} />
        ))}
      </View>
    </View>
  );
}

const styles = createThemedStyles({
  origin: {
    position: "absolute",
    width: 0,
    height: 0,
  },
  ring: {
    position: "absolute",
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "transparent",
  },
});
