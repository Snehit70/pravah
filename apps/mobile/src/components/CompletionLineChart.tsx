/**
 * CompletionLineChart
 *
 * Minimal SVG line chart for the Stats screen. Renders the completion-count
 * series as a filled area + line, with a faint dashed rolling-average line
 * on top. Intentionally lightweight: no external chart lib, no axes — just
 * the shape of the data, with start/end date labels under the plot and a
 * peak-value annotation. Width is responsive to the layout it sits in.
 */

import { useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { colors, radii, spacing, typography } from "../theme/tokens";
import type { DayPoint } from "../lib/statsAggregators";

type Props = {
  series: DayPoint[];
  rollingAvg: number[];
  height?: number;
};

function formatShortDate(yyyyMmDd: string): string {
  const [y, m, d] = yyyyMmDd.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function CompletionLineChart({ series, rollingAvg, height = 180 }: Props) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const { linePath, areaPath, avgPath, peak } = useMemo(() => {
    if (width === 0 || series.length === 0) {
      return { linePath: "", areaPath: "", avgPath: "", peak: 0 };
    }
    const padX = 8;
    const padTop = 18;
    const padBottom = 12;
    const innerW = Math.max(1, width - padX * 2);
    const innerH = Math.max(1, height - padTop - padBottom);
    const peak = Math.max(1, ...series.map((p) => p.count));
    const stepX = series.length > 1 ? innerW / (series.length - 1) : 0;
    const yFor = (v: number) => padTop + innerH - (v / peak) * innerH;

    const pts = series.map((p, i) => ({ x: padX + i * stepX, y: yFor(p.count) }));
    const linePath = pts
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(" ");
    const areaPath =
      pts.length > 0
        ? `${linePath} L${pts[pts.length - 1].x.toFixed(1)} ${(padTop + innerH).toFixed(
            1,
          )} L${pts[0].x.toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`
        : "";

    const avgPts = rollingAvg.map((v, i) => ({ x: padX + i * stepX, y: yFor(v) }));
    const avgPath = avgPts
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(" ");

    return { linePath, areaPath, avgPath, peak };
  }, [series, rollingAvg, width, height]);

  const total = useMemo(
    () => series.reduce((s, p) => s + p.count, 0),
    [series],
  );

  return (
    <View style={styles.card} onLayout={onLayout}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Completion velocity</Text>
        <Text style={styles.totalText}>
          {total} <Text style={styles.totalMeta}>done</Text>
        </Text>
      </View>
      <View style={{ height }}>
        {width > 0 && series.length > 0 ? (
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.accent} stopOpacity="0.28" />
                <Stop offset="1" stopColor={colors.accent} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            {areaPath ? <Path d={areaPath} fill="url(#fill)" /> : null}
            {linePath ? (
              <Path
                d={linePath}
                stroke={colors.accent}
                strokeWidth={2}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {avgPath ? (
              <Path
                d={avgPath}
                stroke={colors.textMuted}
                strokeWidth={1}
                strokeDasharray="3 4"
                fill="none"
                opacity={0.7}
              />
            ) : null}
          </Svg>
        ) : null}
      </View>
      <View style={styles.axisRow}>
        <Text style={styles.axisText}>
          {series.length > 0 ? formatShortDate(series[0].date) : ""}
        </Text>
        <Text style={styles.axisText}>
          peak {peak}/day
        </Text>
        <Text style={styles.axisText}>
          {series.length > 0 ? formatShortDate(series[series.length - 1].date) : ""}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.bgCard,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing.sm,
  },
  title: {
    ...typography.bodyMd,
    color: colors.textPrimary,
  },
  totalText: {
    ...typography.title,
    color: colors.textPrimary,
  },
  totalMeta: {
    ...typography.micro,
    color: colors.textMuted,
  },
  axisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: spacing.xs,
  },
  axisText: {
    ...typography.micro,
    color: colors.textMuted,
  },
});
