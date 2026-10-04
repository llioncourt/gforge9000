import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dices } from "lucide-react";
import { listCampaignRolls } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { outcomeTone } from "@/components/app/dice-outcome";
import { cn } from "@/lib/utils";
import { useT, useFormatters } from "@/i18n/hooks";

export function RollsPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const { t } = useT("campaigns");
  const f = useFormatters();
  const queryClient = useQueryClient();
  const rolls = useQuery({
    queryKey: ["campaign-rolls", campaignId],
    queryFn: () => listCampaignRolls(campaignId),
    refetchInterval: 15_000,
  });

  // Live feed: any new roll in this campaign refreshes the list.
  useEffect(() => {
    const channel = supabase
      .channel(`rolls:${campaignId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "roll_history",
          filter: `campaign_id=eq.${campaignId}`,
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["campaign-rolls", campaignId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [campaignId, queryClient]);

  if (rolls.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const rows = rolls.data ?? [];

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {isGm ? t("rolls.descriptionGm") : t("rolls.descriptionPlayer")}
      </p>
      {rows.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          {t("rolls.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              data-search-id={r.id}
              className="panel flex items-center gap-3 p-3 text-sm"
            >
              <span className="stat-value w-10 shrink-0 text-center text-lg">{r.total}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">
                  {r.label}
                  {r.character_name ? (
                    <span className="text-muted-foreground"> · {r.character_name}</span>
                  ) : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {r.display_name} · {r.expression} · {r.dice.join(" + ")}
                  {r.target !== null
                    ? ` · ${t("rolls.vsTarget", { target: r.target })}`
                    : ""} · {f.dateTime(r.created_at)}
                </p>
              </div>
              {r.outcome ? (
                <Badge variant="outline" className={cn("shrink-0", outcomeTone(r.outcome))}>
                  {r.outcome}
                </Badge>
              ) : (
                <Dices className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
