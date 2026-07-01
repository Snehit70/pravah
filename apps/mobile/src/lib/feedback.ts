import { haptic } from "./haptic";
import { sound } from "./sound";

// Central semantic feedback layer. Sound hooks will be added here once the
// sound asset palette exists; screens should call these events instead of raw
// haptic/audio APIs.
export const feedback = {
  selection: () => haptic.selection(),
  success: () => {
    sound.play("success");
    haptic.success();
  },
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
