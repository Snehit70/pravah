import * as Haptics from "expo-haptics";

export const haptic = {
  light: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  medium: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  heavy: () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  selection: () => void Haptics.selectionAsync(),
};
