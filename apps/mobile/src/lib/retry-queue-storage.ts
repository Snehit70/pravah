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

// ── One-time migration from SecureStore ───────────────────────────────────
//
// Older app versions persisted the retry queue in SecureStore. When the
// backend probe selects AsyncStorage, a first-read migration checks whether
// SecureStore still holds data for the key. If AsyncStorage is empty and
// SecureStore has a value, the data is copied across and the SecureStore
// entry is deleted. This runs at most once per session per key.

const _migratedKeys = new Set<string>();

async function migrateFromSecureStoreIfNeeded(key: string): Promise<void> {
  if (_backend !== "async" || _migratedKeys.has(key)) return;

  try {
    const existing = await AsyncStorage.getItem(key);
    if (existing) {
      _migratedKeys.add(key);
      return; // AsyncStorage already has data — nothing to migrate.
    }

    const legacy = await SecureStore.getItemAsync(key);
    if (!legacy) {
      _migratedKeys.add(key);
      return; // No legacy data in SecureStore either.
    }

    await AsyncStorage.setItem(key, legacy);
    await SecureStore.deleteItemAsync(key);
    _migratedKeys.add(key);
    mobileLogger.info("retry_queue_migrated_from_secure_store", { key });
  } catch (error) {
    // Migration is best-effort; a failure here means the user loses the
    // queued retries but is not blocked from using the app.
    mobileLogger.warn("retry_queue_migration_failed", {
      key,
      errorType: classifyError(error),
    });
  }
}

export const retryQueueStorage = {
  async getItem(key: string): Promise<string | null> {
    const backend = await resolveBackend();
    if (backend === "async") {
      await migrateFromSecureStoreIfNeeded(key);
      return AsyncStorage.getItem(key);
    }
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
