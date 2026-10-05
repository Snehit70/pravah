import { colors } from "./tokens";
import { getThemeRuntimeSnapshot } from "./themeRuntime";

type PillAppearance = {
  container: { backgroundColor: string; borderColor: string; borderWidth: number };
  textColor: string;
};

function lightPill(backgroundColor: string, textColor: string): PillAppearance {
  return { container: { backgroundColor, borderColor: "transparent", borderWidth: 0 }, textColor };
}

function darkPill(backgroundColor: string, textColor: string, borderColor: string): PillAppearance {
  return { container: { backgroundColor, borderColor, borderWidth: 0.5 }, textColor };
}

// Opaque container colors keep these pairs consistent on cards, day panels,
// and sheets. Their foregrounds are softer than action/status colors.
const darkNeutral = darkPill("#33332f", "#bdbdb5", "#45453e");
const darkPriorities = {
  p1: darkPill("#3a2a29", "#efa69c", "#563b37"),
  p2: darkPill("#383024", "#e3c08b", "#514430"),
  p3: darkNeutral,
};
const darkGoalTints = [
  darkPill("#283830", "#b1d5bf", "#3b5145"),
  darkPill("#393224", "#dec793", "#51462f"),
  darkPill("#3c2f28", "#dbbaa5", "#554236"),
];

/** Mix a tint in sRGB, returning a solid RN color rather than an alpha wash. */
function mixColor(foreground: string, background: string, amount: number): string {
  const channels = [1, 3, 5].map((offset) => {
    const front = Number.parseInt(foreground.slice(offset, offset + 2), 16);
    const back = Number.parseInt(background.slice(offset, offset + 2), 16);
    return Math.round(front * amount + back * (1 - amount)).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export function priorityPillFor(priority: "p1" | "p2" | "p3"): PillAppearance & { label: string } {
  const appearance = getThemeRuntimeSnapshot().appearance === "dark"
    ? darkPriorities[priority]
    : {
        p1: lightPill(colors.errorMuted, colors.priorityP1),
        p2: lightPill(colors.warningMuted, colors.priorityP2),
        p3: lightPill(colors.successMuted, colors.priorityP3),
      }[priority];
  return { ...appearance, label: priority.toUpperCase() };
}

export function goalPillFor(goalName: string): PillAppearance {
  // Preserve the existing assignment so a goal retains its color family.
  let hash = 0;
  for (let i = 0; i < goalName.length; i += 1) {
    hash = (hash * 31 + goalName.charCodeAt(i)) >>> 0;
  }
  const index = hash % 4;
  if (getThemeRuntimeSnapshot().appearance === "light") {
    return [
      lightPill(colors.accentSoft, colors.accent),
      lightPill(colors.successMuted, colors.success),
      lightPill(colors.warningMuted, colors.warning),
      lightPill(colors.deadlineMuted, colors.deadline),
    ][index];
  }
  if (index > 0) return darkGoalTints[index - 1];
  return darkPill(
    mixColor(colors.accent, colors.bgFloating, 0.12),
    mixColor(colors.accent, colors.textPrimary, 0.65),
    mixColor(colors.accent, colors.bgFloating, 0.24),
  );
}

export function progressPillFor(completedCount: number): PillAppearance {
  if (getThemeRuntimeSnapshot().appearance === "light") {
    return lightPill(colors.successMuted, colors.success);
  }
  return completedCount > 0 ? darkGoalTints[0] : darkNeutral;
}
