import { useWindowDimensions, View, StyleSheet } from "react-native";
import Svg, { Defs, Pattern, Path, Rect, RadialGradient, Stop } from "react-native-svg";
import { colors } from "../theme/tokens";
import { getThemeRuntimeSnapshot } from "../theme/themeRuntime";

/**
 * A 32px warm-ink grid at low opacity,
 * masked with a radial gradient so the grid only reads near the center.
 *
 * Implementation notes:
 *   1. The grid is an SVG `<Pattern>` of crossed 1px lines tiled at 32px.
 *   2. The "mask" is faked with a second full-screen Rect filled with a
 *      radial gradient that goes from transparent at the center to the
 *      page color at the edges, so the painter's algorithm hides the grid
 *      near the rim. This avoids react-native-svg's spotty support for
 *      the SVG `mask` attribute.
 *
 * Decorative; `pointerEvents="none"`. Mount once at the root behind the UI.
 */
export function GridBackground() {
  const { width, height } = useWindowDimensions();
  const cell = 32;
  const lineColor =
    getThemeRuntimeSnapshot().appearance === "dark"
      ? "rgba(231,213,235,0.045)"
      : "rgba(78,62,43,0.055)";

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <Pattern id="grid" width={cell} height={cell} patternUnits="userSpaceOnUse">
            <Path
              d={`M ${cell} 0 L 0 0 0 ${cell}`}
              fill="none"
              stroke={lineColor}
              strokeWidth={1}
            />
          </Pattern>
          {/* Inverse vignette: transparent in the middle, bg-color at edges. */}
          <RadialGradient id="vignette" cx="50%" cy="50%" rx="65%" ry="60%">
            <Stop offset="0" stopColor={colors.bg} stopOpacity={0} />
            <Stop offset="0.55" stopColor={colors.bg} stopOpacity={0.55} />
            <Stop offset="1" stopColor={colors.bg} stopOpacity={1} />
          </RadialGradient>
        </Defs>

        <Rect width="100%" height="100%" fill="url(#grid)" />
        <Rect width="100%" height="100%" fill="url(#vignette)" />
      </Svg>
    </View>
  );
}
