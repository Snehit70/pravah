import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { classifyError, mobileLogger } from "./logger";

// Keys touched by the secure-store backed parts of the app. Listed explicitly
// so a wipe doesn't accidentally remove unrelated SecureStore entries that
// other libraries put on the device (e.g. auth tokens that belong to OS-level
// SDKs).
const SECURE_STORE_KEYS = [
  "pravah_daily_reminder_notification_id_v1",
];

// Wipe every Pravah-prefixed entry in AsyncStorage and the known SecureStore
// keys. Used by the Danger Zone "Wipe local cache" action so the user can
// recover from corrupt local state without uninstalling. Returns the count of
// keys removed for logging/telemetry.
export async function wipeLocalAppData(): Promise<{ removedAsync: number; removedSecure: number }> {
  let removedAsync = 0;
  let removedSecure = 0;

  try {
    const keys = await AsyncStorage.getAllKeys();
    const pravahKeys = keys.filter((key) => key.startsWith("pravah_"));
    if (pravahKeys.length > 0) {
      await AsyncStorage.multiRemove(pravahKeys);
      removedAsync = pravahKeys.length;
    }
  } catch (error) {
    mobileLogger.warn("wipe_async_storage_failed", { errorType: classifyError(error) });
  }

  for (const key of SECURE_STORE_KEYS) {
    try {
      await SecureStore.deleteItemAsync(key);
      removedSecure += 1;
    } catch (error) {
      mobileLogger.warn("wipe_secure_store_failed", {
        errorType: classifyError(error),
        key,
      });
    }
  }

  return { removedAsync, removedSecure };
}
