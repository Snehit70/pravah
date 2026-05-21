import { useEffect } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useReducedMotion } from "../hooks/useReducedMotion";

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Tapered river: starts narrow at top-right, curves down, widens at bottom.
 * t (0→1→0) drives a gentle meander — the river sways slightly side to side.
 */
function buildRiver(w: number, h: number, t: number): string {
  "worklet";
  const sway = (t - 0.5) * 0.08; // ±4% sway

  // River centerline control points
  const startX = w * (0.78 + sway);
  const cp1x = w * (0.82 + sway * 0.5);
  const cp1y = h * 0.22;
  const cp2x = w * (0.55 - sway * 0.5);
  const cp2y = h * 0.58;
  const endX = w * (0.38 - sway);
  const endY = h * 1.0;

  // River width: 14px at top, 110px at bottom (tapers open like a real river)
  const topW = 14;
  const botW = 110;

  // Left bank (narrower side of river)
  const lStartX = startX - topW * 0.4;
  const lCP1x = cp1x - topW * 0.6;
  const lCP2x = cp2x - botW * 0.35;
  const lEndX = endX - botW * 0.5;

  // Right bank (wider side of river)
  const rStartX = startX + topW * 0.6;
  const rCP1x = cp1x + topW * 0.4;
  const rCP2x = cp2x + botW * 0.65;
  const rEndX = endX + botW * 0.5;

  return (
    // Left bank down
    `M ${lStartX} 0 ` +
    `C ${lCP1x} ${cp1y}, ${lCP2x} ${cp2y}, ${lEndX} ${endY} ` +
    // Across the bottom
    `L ${rEndX} ${endY} ` +
    // Right bank back up
    `C ${rCP2x} ${cp2y}, ${rCP1x} ${cp1y}, ${rStartX} 0 Z`
  );
}

export function FlowingWaves() {
  const { width, height } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const t = useSharedValue(0.5);

  useEffect(() => {
    if (reducedMotion) return;
    t.value = withRepeat(
      withTiming(1, { duration: 5000, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
  }, [reducedMotion, t]);

  const riverProps = useAnimatedProps(() => ({
    d: buildRiver(width, height, t.value),
  }));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="riverGrad" x1="0.8" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor="#c4bbff" stopOpacity="0.6" />
            <Stop offset="0.4" stopColor="#8b7de8" stopOpacity="0.45" />
            <Stop offset="1" stopColor="#5a4fc7" stopOpacity="0.25" />
          </LinearGradient>
        </Defs>
        {/* Base river fill */}
        <AnimatedPath
          animatedProps={riverProps}
          fill="url(#riverGrad)"
        />
      </Svg>
    </View>
  );
}

