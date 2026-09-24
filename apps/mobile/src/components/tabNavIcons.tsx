import { type ComponentType } from "react";
import Svg, { Line, type SvgProps } from "react-native-svg";
import { type TabKey } from "../lib/tabOrder";
import NavInboxAsset from "../assets/icons/nav-inbox.svg";
import NavInboxFillAsset from "../assets/icons/nav-inbox-fill.svg";
import NavTimelineAsset from "../assets/icons/nav-timeline.svg";
import NavTimelineFillAsset from "../assets/icons/nav-timeline-fill.svg";
import NavGoalsAsset from "../assets/icons/nav-goals.svg";
import NavGoalsFillAsset from "../assets/icons/nav-goals-fill.svg";
import NavProgressAsset from "../assets/icons/nav-progress.svg";
import NavProgressFillAsset from "../assets/icons/nav-progress-fill.svg";

// Traced outline+fill asset pairs (scripts/trace-icon.sh). Kept in their own
// module (not BottomTabBar) so the settings tab-order preview can render the
// same marks as the live bar without importing the bar component.

const OUTLINE_ASSETS: Record<TabKey, ComponentType<SvgProps>> = {
  inbox: NavInboxAsset,
  timeline: NavTimelineAsset,
  goals: NavGoalsAsset,
  insights: NavProgressAsset,
};

const FILL_ASSETS: Record<TabKey, ComponentType<SvgProps>> = {
  inbox: NavInboxFillAsset,
  timeline: NavTimelineFillAsset,
  goals: NavGoalsFillAsset,
  insights: NavProgressFillAsset,
};

export function CaptureIcon({ color, size }: { color: string; size: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Line x1={12} y1={5.25} x2={12} y2={18.75} />
      <Line x1={5.25} y1={12} x2={18.75} y2={12} />
    </Svg>
  );
}

export function TabNavIcon({
  tab,
  color,
  size,
  fill = false,
}: {
  tab: TabKey;
  color: string;
  size: number;
  fill?: boolean;
}) {
  const Asset = (fill ? FILL_ASSETS : OUTLINE_ASSETS)[tab];
  return <Asset color={color} width={size} height={size} />;
}
