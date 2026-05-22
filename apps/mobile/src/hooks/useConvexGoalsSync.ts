import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { goalsStore } from "../lib/goalsStorage";
import { goalLinksStore } from "../lib/goalLinks";

export function useConvexGoalsSync() {
  const serverGoals = useQuery(api.goals.list);
  const serverLinks = useQuery(api.goals.listLinks);
  const upsertGoal = useMutation(api.goals.upsert);
  const migratedRef = useRef(false);

  useEffect(() => {
    if (serverGoals === undefined) return;

    if (!migratedRef.current && serverGoals.length === 0) {
      void goalsStore.hydrate().then(() => {
        migratedRef.current = true;
        const local = goalsStore.get();
        if (local.length > 0) {
          for (const g of local) {
            void upsertGoal({
              clientId: g.id,
              text: g.text,
              description: g.description,
              deadline: g.deadline,
              priority: g.priority,
              createdAt: g.createdAt ?? Date.now(),
            });
          }
        }
      });
      return;
    }

    migratedRef.current = true;
    goalsStore._syncFromServer(serverGoals);
  }, [serverGoals, upsertGoal]);

  useEffect(() => {
    if (serverLinks === undefined) return;
    goalLinksStore._syncFromServer(serverLinks);
  }, [serverLinks]);
}
