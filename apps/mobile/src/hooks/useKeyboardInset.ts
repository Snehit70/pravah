import { useEffect, useState } from "react";
import { Keyboard, Platform } from "react-native";
import { spacing } from "../theme/tokens";

export function useKeyboardInset(bottomInset: number) {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(Math.max(0, event.endCoordinates.height));
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return keyboardHeight > 0
    ? Math.max(spacing.sm, keyboardHeight - bottomInset + spacing.sm)
    : Math.max(bottomInset, spacing.lg);
}
