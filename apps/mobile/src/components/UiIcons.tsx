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

export const ChevronUpIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="m6 14.5 6-6 6 6" />
  </Svg>
));

export const ChevronDownIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="m6 9.5 6 6 6-6" />
  </Svg>
));

export const ArrowUpRightIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M7 17 17 7" />
    <Path d="M9.5 7H17v7.5" />
  </Svg>
));

export const BarChartIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M5 20V13" />
    <Path d="M12 20V5" />
    <Path d="M19 20v-10" />
  </Svg>
));

export const LineChartIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M4 15l4.5-5.5 3.5 3L19 6" />
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

export const KeyIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="m16.555 3.843 3.602 3.602a2.877 2.877 0 0 1 0 4.069l-2.643 2.643a2.877 2.877 0 0 1-4.069 0l-.301-.301-6.558 6.558a2 2 0 0 1-1.239.578L5.172 21H4a1 1 0 0 1-.993-.883L3 20v-1.172a2 2 0 0 1 .467-1.284l.119-.13L4 17h2v-2h2v-2l2.144-2.144-.301-.301a2.877 2.877 0 0 1 0-4.069l2.643-2.643a2.877 2.877 0 0 1 4.069 0M15 9h.01" />
  </Svg>
));

export const AdjustmentsIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Circle cx={14} cy={6} r={2} />
    <Path d="M4 6h8" />
    <Path d="M16 6h4" />
    <Circle cx={8} cy={12} r={2} />
    <Path d="M4 12h2" />
    <Path d="M10 12h10" />
    <Circle cx={17} cy={18} r={2} />
    <Path d="M4 18h11" />
    <Path d="M19 18h1" />
  </Svg>
));

export const CopyIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M9.5 8.5h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
    <Path d="M5.5 15.5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
  </Svg>
));

export const DownloadTrayIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M12 4v10" />
    <Path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <Path d="M4 16.5v1.5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1.5" />
  </Svg>
));

export const BugIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M9 8.5a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0Z" />
    <Path d="M9.5 7a2.5 2.5 0 0 1 5 0" />
    <Path d="M12 16.5V20" />
    <Path d="M9 10H5.5" />
    <Path d="M15 10h3.5" />
    <Path d="M9.3 13.5 6 15.5" />
    <Path d="m14.7 13.5 3.3 2" />
    <Path d="M9.6 6.4 7.5 4.5" />
    <Path d="m14.4 6.4 2.1-1.9" />
  </Svg>
));

export const GitBranchIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Circle cx={6.5} cy={6} r={2.25} />
    <Circle cx={6.5} cy={18} r={2.25} />
    <Circle cx={17.5} cy={6} r={2.25} />
    <Path d="M6.5 8.25v7.5" />
    <Path d="M17.5 8.25a5 5 0 0 1-5 5h-2" />
  </Svg>
));

export const SmartphoneIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M10 3.5h4a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3h-4a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3Z" />
    <Path d="M11 17h2" />
  </Svg>
));

export const UpdateArrowIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M12 3.75c5.75 0 8.25 2.5 8.25 8.25s-2.5 8.25-8.25 8.25S3.75 17.75 3.75 12 6.25 3.75 12 3.75Z" />
    <Path d="M12 15.5v-7" />
    <Path d="m8.75 11.5 3.25-3.25 3.25 3.25" />
  </Svg>
));

export const FileTextIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M8 3.5h5.5L18 8v9.5a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-11a3 3 0 0 1 3-3Z" />
    <Path d="M13.5 3.5V8H18" />
    <Path d="M8.5 12.5H14" />
    <Path d="M8.5 16H12" />
  </Svg>
));

export const PulseIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M3.5 12h3.25l2.5-5.5 3.5 11 2.5-5.5h5.25" />
  </Svg>
));

export const RetryArrowIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <Path d="M19.5 3.5v3.5H16" />
  </Svg>
));

export const AlertSquircleIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M12 3.75c5.75 0 8.25 2.5 8.25 8.25s-2.5 8.25-8.25 8.25S3.75 17.75 3.75 12 6.25 3.75 12 3.75Z" />
    <Line x1={12} y1={7.75} x2={12} y2={12.75} />
    <Circle cx={12} cy={16.35} r={0.8} fill={color} stroke="none" />
  </Svg>
));

export const CheckIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="m5 12.5 4.5 4.5L19 7" />
  </Svg>
));

export const PlusIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Line x1={12} y1={6} x2={12} y2={18} />
    <Line x1={6} y1={12} x2={18} y2={12} />
  </Svg>
));

export const CloseIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Line x1={6.5} y1={6.5} x2={17.5} y2={17.5} />
    <Line x1={17.5} y1={6.5} x2={6.5} y2={17.5} />
  </Svg>
));

export const PencilIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M14.5 5.5 18.5 9.5" />
    <Path d="M16.2 3.8a2 2 0 0 1 2.8 0l1.2 1.2a2 2 0 0 1 0 2.8L8.4 20.1 3.5 21l.9-4.9Z" />
  </Svg>
));

export const TrashIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M4.5 6.5h15" />
    <Path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7" />
    <Path d="M6.5 6.5 7.3 19a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12.5" />
    <Line x1={10} y1={10.5} x2={10} y2={16.5} />
    <Line x1={14} y1={10.5} x2={14} y2={16.5} />
  </Svg>
));

/** A broken link: the two halves pull apart, with the gap left open. */
export const UnlinkIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M9.2 7.3 11 5.5a4 4 0 0 1 5.7 5.7l-1.8 1.8" />
    <Path d="M14.8 16.7 13 18.5a4 4 0 0 1-5.7-5.7l1.8-1.8" />
    <Line x1={4.5} y1={4.5} x2={19.5} y2={19.5} />
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

export const EyeIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M3.75 12s2.85-5 8.25-5 8.25 5 8.25 5-2.85 5-8.25 5-8.25-5-8.25-5Z" />
    <Circle cx={12} cy={12} r={2.25} />
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

export const CalendarIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M6.5 5.75h11a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2v-9.5a2 2 0 0 1 2-2Z" />
    <Path d="M4.5 9.75h15" />
    <Path d="M8.5 3.75v3" />
    <Path d="M15.5 3.75v3" />
  </Svg>
));

export const ClockIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Circle cx={12} cy={12} r={7.75} />
    <Path d="M12 8v4.25l2.75 1.75" />
  </Svg>
));

export const StarIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M12 4.5l2.32 4.7 5.18.75-3.75 3.66.88 5.14L12 16.5l-4.63 2.44.88-5.14-3.75-3.66 5.18-.75L12 4.5Z" />
  </Svg>
));

export const MailIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M4.5 6.75h15a.75.75 0 0 1 .75.75v9a.75.75 0 0 1-.75.75h-15a.75.75 0 0 1-.75-.75v-9a.75.75 0 0 1 .75-.75Z" />
    <Path d="m4.5 8 7.5 5.25L19.5 8" />
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

export const BellIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M12 4.75a4.75 4.75 0 0 1 4.75 4.75c0 3.1.85 4.75 1.5 5.75H5.75c.65-1 1.5-2.65 1.5-5.75A4.75 4.75 0 0 1 12 4.75Z" />
    <Path d="M10.25 18.25a1.85 1.85 0 0 0 3.5 0" />
  </Svg>
));

export const MoonIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M18.75 13.9a7 7 0 0 1-8.65-8.65 7 7 0 1 0 8.65 8.65Z" />
  </Svg>
));

export const LedgerCheckIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M7.5 5.5h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
    <Path d="m8.75 12 2 2 4.5-4.5" />
    <Path d="M8.5 8.5h7" />
  </Svg>
));

export const StackPlusIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M4 7h9" />
    <Path d="M4 12h9" />
    <Path d="M4 17h6" />
    <Path d="M17.5 14v6" />
    <Path d="M14.5 17h6" />
  </Svg>
));

export const SwipeIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M4 12h16" />
    <Path d="m16.75 8.75 3.25 3.25-3.25 3.25" />
    <Path d="M7.25 8.75 4 12l3.25 3.25" />
  </Svg>
));

export const VibrateIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M9.5 5.5h5A1.5 1.5 0 0 1 16 7v10a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 17V7a1.5 1.5 0 0 1 1.5-1.5Z" />
    <Path d="M4.5 9.5v5" />
    <Path d="M19.5 9.5v5" />
  </Svg>
));

export const SpeakerIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Path d="M4 9.5v5h3l4.5 3.5v-12L7 9.5H4Z" />
    <Path d="M15 9.75a3.5 3.5 0 0 1 0 4.5" />
    <Path d="M17.75 7.5a7 7 0 0 1 0 9" />
  </Svg>
));

export const MotionIcon = icon(({ color, size, strokeWidth }) => (
  <Svg {...frame(color, size, strokeWidth)}>
    <Circle cx={14.5} cy={12} r={4.5} />
    <Path d="M3.5 8.5H8" />
    <Path d="M2.5 12h4.5" />
    <Path d="M3.5 15.5H8" />
  </Svg>
));
