import { colors } from "../theme/tokens";
import type { AccentColor } from "./userPreferences";

/** Maps the Appearance → Task color preference to the emphasis color used on
 *  task metadata (P1 badges, goal glyphs, completion accents). */
export function taskEmphasisColor(scheme: AccentColor): string {
  switch (scheme) {
    case "copper":
      return colors.deadline;
    case "teal":
      return colors.success;
    case "rose":
      return colors.error;
    case "purple":
      return colors.accent;
  }
}
