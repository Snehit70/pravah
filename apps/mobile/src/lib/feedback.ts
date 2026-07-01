import { haptic } from "./haptic";
import { sound } from "./sound";

// Central semantic feedback layer. Screens should call these events instead of
// choosing raw haptic or audio effects themselves.
export const feedback = {
  selection: () => haptic.selection(),
  light: () => haptic.light(),
  medium: () => haptic.medium(),
  success: () => haptic.success(),
  warning: () => {
    sound.play("warning");
    haptic.warning();
  },
  error: () => {
    sound.play("error");
    haptic.error();
  },
  captureSaved: () => {
    sound.play("capture");
    haptic.light();
  },
  taskCompleted: () => {
    sound.play("success");
    haptic.success();
  },
  taskScheduled: () => haptic.light(),
  taskReopened: () => haptic.light(),
  kairoPlanApplied: () => {
    sound.play("success");
    haptic.success();
  },
  destructiveConfirmed: () => {
    sound.play("warning");
    haptic.error();
  },
};
