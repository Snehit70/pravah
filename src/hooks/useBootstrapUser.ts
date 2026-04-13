import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useBootstrapUser(enabled: boolean) {
  const [ready, setReady] = useState(false);
  const storeUser = useMutation(api.users.store);
  const claimLegacyData = useMutation(api.users.claimLegacyData);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      await storeUser({});
      await claimLegacyData({});
      if (!cancelled) {
        setReady(true);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [claimLegacyData, enabled, storeUser]);

  return ready;
}
