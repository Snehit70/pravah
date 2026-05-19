import AsyncStorage from "@react-native-async-storage/async-storage";
import { classifyError, mobileLogger } from "./logger";

const DEVICE_ID_STORAGE_KEY = "pravah_mobile_device_id_v1";

function randomHex(length: number): string {
  let out = "";
  while (out.length < length) {
    out += Math.floor(Math.random() * 16).toString(16);
  }
  return out;
}

// Generate-on-first-read identifier scoped to this install. Used in
// diagnostics so support can correlate device-side reports without a backend
// account. Cleared by the wipe-cache flow.
export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await AsyncStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (existing && existing.length >= 8) return existing;
    const generated = `dev-${randomHex(12)}`;
    await AsyncStorage.setItem(DEVICE_ID_STORAGE_KEY, generated);
    return generated;
  } catch (error) {
    mobileLogger.warn("device_id_load_failed", { errorType: classifyError(error) });
    return `dev-${randomHex(12)}`;
  }
}

export async function resetDeviceId(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEVICE_ID_STORAGE_KEY);
  } catch (error) {
    mobileLogger.warn("device_id_reset_failed", { errorType: classifyError(error) });
  }
}
