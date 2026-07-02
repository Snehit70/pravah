import type { JSX } from "react";
import Svg, { Circle, Line, Path } from "react-native-svg";

type IconProps = {
  color: string;
  size?: number;
  strokeWidth?: number;
};

function frame(color: string, size: number, strokeWidth: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: color,
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
}

function icon(render: (props: Required<IconProps>) => JSX.Element) {
  return function Icon({
    color,
    size = 18,
    strokeWidth = 2,
  }: IconProps) {
    return render({ color, size, strokeWidth });
  };
}

export const ChevronLeftIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="m14.5 6-6 6 6 6" />
  </Svg>
));

export const ChevronRightIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="m9.5 6 6 6-6 6" />
  </Svg>
));

export const ArrowUpRightIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M7 17 17 7" />
    <Path d="M9.5 7H17v7.5" />
  </Svg>
));

export const SettingsIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Circle cx={12} cy={12} r={2.75} />
    <Path d="M12 3.75v2.1" />
    <Path d="M12 18.15v2.1" />
    <Path d="m5.64 5.64 1.48 1.48" />
    <Path d="m16.88 16.88 1.48 1.48" />
    <Path d="M3.75 12h2.1" />
    <Path d="M18.15 12h2.1" />
    <Path d="m5.64 18.36 1.48-1.48" />
    <Path d="m16.88 7.12 1.48-1.48" />
  </Svg>
));

export const PlusIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Line x1={12} y1={6} x2={12} y2={18} />
    <Line x1={6} y1={12} x2={18} y2={12} />
  </Svg>
));

export const InfoCircleIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Circle cx={12} cy={12} r={8} />
    <Line x1={12} y1={10.5} x2={12} y2={16} />
    <Circle cx={12} cy={7.25} r={0.8} fill={color} stroke="none" />
  </Svg>
));

export const AlertCircleIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Circle cx={12} cy={12} r={8} />
    <Line x1={12} y1={8} x2={12} y2={12.5} />
    <Circle cx={12} cy={16.35} r={0.8} fill={color} stroke="none" />
  </Svg>
));

export const SyncLoopIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M18.25 8.25a6.5 6.5 0 0 0-10.95-2.7" />
    <Path d="M7.3 5.55v3.4h3.35" />
    <Path d="M5.75 15.75a6.5 6.5 0 0 0 10.95 2.7" />
    <Path d="M16.7 18.45v-3.4h-3.35" />
  </Svg>
));

export const InboxTrayIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M4.5 8.5h15l-1.35 8.25a2 2 0 0 1-1.98 1.65H7.83a2 2 0 0 1-1.98-1.65Z" />
    <Path d="M8.25 12.25h2.25a1.5 1.5 0 0 0 3 0h2.25" />
  </Svg>
));

export const ChatBubbleIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M6.25 8.5a3.75 3.75 0 0 1 3.75-3.75h4a3.75 3.75 0 0 1 3.75 3.75v3a3.75 3.75 0 0 1-3.75 3.75h-2.25L8 18.5v-3.25H10a3.75 3.75 0 0 1-3.75-3.75Z" />
  </Svg>
));

export const LedgerCheckIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M7.5 5.5h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
    <Path d="m8.75 12 2 2 4.5-4.5" />
    <Path d="M8.5 8.5h7" />
  </Svg>
));
