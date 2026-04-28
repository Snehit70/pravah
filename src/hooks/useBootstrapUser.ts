import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useBootstrapUser(enabled: boolean) {
  const [ready, setReady] = useState(false);
  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        await storeUser({});
      } catch (error) {
        console.error("Failed to bootstrap user", error);
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [enabled, storeUser]);

  return ready;
}
