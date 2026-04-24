import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { classifyError, mobileLogger } from "./logger";

// ── Storage backend selection ─────────────────────────────────────────────
//
// We probe AsyncStorage once at first use and then stick with the result for
// the entire session. This prevents a split-brain problem: if setItem fell
// back to SecureStore after an AsyncStorage failure, subsequent getItem calls
// would try AsyncStorage first, find nothing (it recovered), and silently
// return null instead of the value that was actually written to SecureStore.
//
// Pick-one-at-init guarantees that every read goes to the same store every
// write went to, regardless of transient per-operation failures.

type StorageBackend = "async" | "secure";

let _backend: StorageBackend | null = null;

async function resolveBackend(): Promise<StorageBackend> {
  if (_backend !== null) return _backend;
  try {
    // A no-op read is sufficient to verify AsyncStorage is reachable.
    await AsyncStorage.getItem("__pravah_storage_probe__");
    _backend = "async";
  } catch (error) {
    mobileLogger.warn("retry_queue_storage_fallback_to_secure_store", {
      errorType: classifyError(error),
    });
    _backend = "secure";
  }
  return _backend;
}

export const retryQueueStorage = {
  async getItem(key: string): Promise<string | null> {
    const backend = await resolveBackend();
    if (backend === "async") return AsyncStorage.getItem(key);
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    const backend = await resolveBackend();
    if (backend === "async") return AsyncStorage.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string): Promise<void> {
    const backend = await resolveBackend();
    if (backend === "async") return AsyncStorage.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  },
};
