import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps World & Lore views in sync when the GM reveals or revokes a record.
 * Listens to `entities` (visibility changes) and `knowledge_grants` (per-player
 * reveals) for one campaign and refreshes the affected queries.
 */
export function useLoreRealtime(campaignId: string | undefined, entityId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!campaignId) return;

    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
      void queryClient.invalidateQueries({ queryKey: ["lore-relationships", campaignId] });
      if (entityId) {
        void queryClient.invalidateQueries({ queryKey: ["entity", entityId] });
        void queryClient.invalidateQueries({ queryKey: ["lore-grants", entityId] });
      }
    };

    const channel = supabase
      .channel(`lore-realtime-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entities", filter: `campaign_id=eq.${campaignId}` },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "knowledge_grants",
          filter: `campaign_id=eq.${campaignId}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [campaignId, entityId, queryClient]);
}
