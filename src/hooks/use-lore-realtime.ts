import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";

/** Bursts of changes (a bulk reveal, an import) collapse into one refresh. */
const COALESCE_MS = 250;

type ChangePayload = {
  new?: { id?: string; entity_id?: string } | null;
  old?: { id?: string; entity_id?: string } | null;
};

function changedEntityId(payload: ChangePayload): string | undefined {
  return (
    payload.new?.entity_id ?? payload.new?.id ?? payload.old?.entity_id ?? payload.old?.id ?? undefined
  );
}

/**
 * Keeps World & Lore views in sync when the GM reveals or revokes a record.
 * Listens to `entities` (visibility changes) and `knowledge_grants` (per-player
 * reveals) for one campaign.
 *
 * A change to a single record only refreshes that record; the campaign-wide
 * lists are refreshed when a record appears or disappears, or when the change
 * does not say which record it touched.
 */
export function useLoreRealtime(campaignId: string | undefined, entityId?: string) {
  const queryClient = useQueryClient();
  const pending = useRef<{ lists: boolean; ids: Set<string> }>({ lists: false, ids: new Set() });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!campaignId) return;

    const flush = () => {
      timer.current = null;
      const { lists, ids } = pending.current;
      pending.current = { lists: false, ids: new Set() };
      if (lists) {
        void queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
        void queryClient.invalidateQueries({ queryKey: ["lore-relationships", campaignId] });
      }
      for (const id of ids) {
        void queryClient.invalidateQueries({ queryKey: ["entity", id] });
        void queryClient.invalidateQueries({ queryKey: ["lore-grants", id] });
      }
    };

    const schedule = () => {
      if (timer.current) return;
      timer.current = setTimeout(flush, COALESCE_MS);
    };

    const handle = (payload: { eventType?: string } & ChangePayload) => {
      const id = changedEntityId(payload);
      const rowAddedOrRemoved = payload.eventType !== "UPDATE";
      if (!id || rowAddedOrRemoved) pending.current.lists = true;
      if (id) {
        pending.current.ids.add(id);
        // The open record's own list rows carry its name and visibility.
        if (id === entityId) pending.current.lists = true;
      }
      schedule();
    };

    const channel = supabase
      .channel(`lore-realtime-${campaignId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "entities", filter: `campaign_id=eq.${campaignId}` },
        handle,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "knowledge_grants",
          filter: `campaign_id=eq.${campaignId}`,
        },
        handle,
      )
      .subscribe();

    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      void supabase.removeChannel(channel);
    };
  }, [campaignId, entityId, queryClient]);
}
