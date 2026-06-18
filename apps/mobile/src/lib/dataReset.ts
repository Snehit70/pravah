import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { clearKairoConfig } from "./kairoConfig";
import { cancelAllRemindersAsync } from "./syncReminders";
import { classifyError, mobileLogger } from "./logger";

// Keys touched by the secure-store backed parts of the app. Listed explicitly
// so a wipe doesn't accidentally remove unrelated SecureStore entries that
// other libraries put on the device (e.g. auth tokens that belong to OS-level
// SDKs).
const SECURE_STORE_KEYS = [
  // Legacy key: the old daily-reminder notification ID stored its OS identifier
  // here. The reminder system no longer uses SecureStore, but this key is kept
  // in the wipe list so a user upgrading from the old version cleans it up.
  "pravah_daily_reminder_notification_id_v1",
  // Legacy retry-queue location: older app versions wrote this to SecureStore
  // directly; current versions fall back to it when AsyncStorage is unavailable.
  "pravah_mobile_retry_queue_v1",
];

// Wipe every Pravah-prefixed entry in AsyncStorage and the known SecureStore
// keys. Used by the Danger Zone "Wipe local cache" action so the user can
// recover from corrupt local state without uninstalling. Returns the count of
// keys removed for logging/telemetry.
export async function wipeLocalAppData(): Promise<{ removedAsync: number; removedSecure: number }> {
  let removedAsync = 0;
  let removedSecure = 0;

  // Cancel all planner-managed Reminders so no orphaned OS notifications fire
  // after the reset.
  try {
    await cancelAllRemindersAsync();
  } catch (error) {
    mobileLogger.warn("wipe_cancel_reminders_failed", { errorType: classifyError(error) });
  }

  // Clear Kairo provider config from SecureStore. These keys are not in
  // AsyncStorage so the prefix-scan below won't reach them.
  try {
    await clearKairoConfig();
  } catch (error) {
    mobileLogger.warn("wipe_kairo_config_failed", { errorType: classifyError(error) });
  }

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
