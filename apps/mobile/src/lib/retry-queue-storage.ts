import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { classifyError, mobileLogger } from "./logger";

async function withAsyncStorageFallback<T>(
  operation: () => Promise<T>,
  fallback: () => Promise<T>,
  operationName: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    mobileLogger.warn("retry_queue_async_storage_unavailable", {
      operationName,
      errorType: classifyError(error),
    });
    return fallback();
  }
}

export const retryQueueStorage = {
  getItem(key: string) {
    return withAsyncStorageFallback(
      () => AsyncStorage.getItem(key),
      () => SecureStore.getItemAsync(key),
      "getItem"
    );
  },
  setItem(key: string, value: string) {
    return withAsyncStorageFallback(
      () => AsyncStorage.setItem(key, value),
      () => SecureStore.setItemAsync(key, value),
      "setItem"
    );
  },
  removeItem(key: string) {
    return withAsyncStorageFallback(
      () => AsyncStorage.removeItem(key),
      () => SecureStore.deleteItemAsync(key),
      "removeItem"
    );
  },
};
