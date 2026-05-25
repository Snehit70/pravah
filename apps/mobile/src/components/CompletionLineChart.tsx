/**
 * CompletionLineChart
 *
 * Minimal SVG bar chart for the Stats screen. Renders daily completion counts
 * as bars with scale labels, plus a faint dashed rolling-average line. Kept
 * dependency-free so JS-only visual changes can still ship through OTA.
 */

import { useMemo, useState } from "react";
import { StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { G, Line, Path, Rect, Text as SvgText } from "react-native-svg";
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

  const { bars, avgPath, scaleMax, ticks, plot } = useMemo(() => {
    const emptyPlot = {
      padX: 8,
      padTop: 18,
      padBottom: 18,
      axisWidth: 30,
      innerW: 0,
      innerH: 0,
    };
    if (width === 0 || series.length === 0) {
      return { bars: [], avgPath: "", scaleMax: 1, ticks: [0], plot: emptyPlot };
    }
    const padX = 8;
    const padTop = 18;
    const padBottom = 18;
    const axisWidth = 30;
    const innerW = Math.max(1, width - padX * 2 - axisWidth);
    const innerH = Math.max(1, height - padTop - padBottom);
    const scaleMax = Math.max(1, Math.max(...series.map((p) => p.count)), ...rollingAvg);
    const tickMid = Math.ceil(scaleMax / 2);
    const ticks = [scaleMax, tickMid, 0].filter((v, i, arr) => arr.indexOf(v) === i);
    const slotW = innerW / series.length;
    const barW = Math.max(3, Math.min(12, slotW * 0.58));
    const yFor = (v: number) => padTop + innerH - (v / scaleMax) * innerH;

    const bars = series.map((p, i) => {
      const x = padX + i * slotW + (slotW - barW) / 2;
      const y = yFor(p.count);
      const h = padTop + innerH - y;
      return {
        x,
        y,
        width: barW,
        height: Math.max(p.count > 0 ? 2 : 0, h),
        count: p.count,
      };
    });

    const avgPts = rollingAvg.map((v, i) => ({
      x: padX + i * slotW + slotW / 2,
      y: yFor(v),
    }));
    const avgPath = avgPts
      .map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
      .join(" ");

    return {
      bars,
      avgPath,
      scaleMax,
      ticks,
      plot: { padX, padTop, padBottom, axisWidth, innerW, innerH },
    };
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
            {ticks.map((tick) => {
              const y = plot.padTop + plot.innerH - (tick / Math.max(1, ticks[0] ?? 1)) * plot.innerH;
              return (
                <G key={`tick-${tick}`}>
                  <Line
                    x1={plot.padX}
                    x2={plot.padX + plot.innerW}
                    y1={y}
                    y2={y}
                    stroke={colors.borderSubtle}
                    strokeWidth={1}
                  />
                  <SvgText
                    x={width - 2}
                    y={y + 4}
                    fill={colors.textMuted}
                    fontSize={10}
                    textAnchor="end"
                  >
                    {tick}
                  </SvgText>
                </G>
              );
            })}
            {bars.map((bar, i) => (
              <Rect
                key={`${series[i]?.date ?? i}-${bar.count}`}
                x={bar.x}
                y={bar.y}
                width={bar.width}
                height={bar.height}
                rx={3}
                fill={bar.count > 0 ? colors.accent : colors.borderSubtle}
                opacity={bar.count > 0 ? 0.92 : 0.45}
              />
            ))}
            {avgPath ? (
              <Path
                d={avgPath}
                stroke={colors.textSecondary}
                strokeWidth={1}
                strokeDasharray="3 4"
                fill="none"
                opacity={0.55}
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
          scale: 0-{Math.ceil(scaleMax)}/day
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
