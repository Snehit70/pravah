import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

let session = { user: { id: "native-ci-user", name: "Native CI", email: "native-ci@example.invalid" } };
const listeners = new Set();
export const authStorageReady = SecureStore.setItemAsync("pravah_kairo_settings_v2", JSON.stringify({
  defaultProvider: "openai",
  profiles: { openai: { apiKey: "fixture-only", model: "fixture", baseUrl: "http://127.0.0.1:8765/v1/chat/completions" } },
}));
export const hasCachedAuthSessionHint = () => Boolean(session);
export const authClient = {
  useSession: () => ({
    data: useSyncExternalStore(
      (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      () => session,
    ),
    isPending: false,
  }),
  signOut: async () => { session = null; listeners.forEach((listener) => listener()); },
};
