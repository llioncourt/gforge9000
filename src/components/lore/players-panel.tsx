import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { kindDef } from "@/lib/entity-kinds";
import { listMembers } from "@/lib/api";
import { listCampaignGrants, listEntities, type EntityRow } from "@/lib/lore";
import { revealEntityToPlayer, revokeEntityReveal } from "@/lib/reveal";
import { VisibilityBadge } from "@/components/lore/visibility-badge";
import { useSession } from "@/hooks/use-session";

/**
 * GM-facing reveal board: which lore record each player has been let in on.
 * Players see the same board read-only, limited to their own reveals by RLS.
 */
export function PlayersPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const members = useQuery({ queryKey: ["members", campaignId], queryFn: () => listMembers(campaignId) });
  const entities = useQuery({
    queryKey: ["lore-entities", campaignId],
    queryFn: () => listEntities(campaignId),
  });
  const grants = useQuery({
    queryKey: ["lore-grants", campaignId],
    queryFn: () => listCampaignGrants(campaignId),
  });

  const entityById = useMemo(() => {
    const map = new Map<string, EntityRow>();
    for (const row of entities.data ?? []) map.set(row.id, row);
    return map;
  }, [entities.data]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["lore-grants", campaignId] });

  const give = useMutation({
    mutationFn: async (input: { userId: string; entityId: string }) => {
      const grant = await grantKnowledge({
        campaign_id: campaignId,
        entity_id: input.entityId,
        user_id: input.userId,
        granted_by: user!.id,
      });
      const entity = entityById.get(input.entityId);
      await createNotification({
        user_id: input.userId,
        campaign_id: campaignId,
        entity_id: input.entityId,
        kind: "reveal",
        title: entity ? `New record revealed: ${entity.name}` : "A new record was revealed",
        body: entity ? kindDef(entity.kind).label : null,
        created_by: user!.id,
      }).catch(() => undefined);
      return grant;
    },
    onSuccess: async () => {
      toast.success("Revealed to the player");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => revokeKnowledge(id),
    onSuccess: async () => {
      toast.success("Reveal removed");
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (members.isLoading || entities.isLoading || grants.isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((index) => (
          <Skeleton key={index} className="h-24 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const rows = members.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Secret records stay hidden until you reveal them here. Public records are always visible.
      </p>
      {rows.map((member) => {
        const mine = (grants.data ?? []).filter((g) => g.user_id === member.user_id);
        const alreadyGranted = new Set(mine.map((g) => g.entity_id));
        const candidates = (entities.data ?? []).filter(
          (row) =>
            !alreadyGranted.has(row.id) &&
            (!search.trim() || row.name.toLowerCase().includes(search.trim().toLowerCase())),
        );
        return (
          <div key={member.user_id} className="panel space-y-3 p-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">{member.display_name}</span>
                <Badge variant="outline" className="text-[10px] uppercase">
                  {member.role}
                </Badge>
              </div>
              {isGm ? (
                <Dialog
                  open={pickerFor === member.user_id}
                  onOpenChange={(open) => setPickerFor(open ? member.user_id : null)}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="mr-1 size-3.5" /> Reveal a record
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Reveal to {member.display_name}</DialogTitle>
                    </DialogHeader>
                    <Input
                      placeholder="Search records"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                    <div className="space-y-1">
                      {candidates.length === 0 ? (
                        <p className="text-muted-foreground text-sm">Nothing left to reveal.</p>
                      ) : (
                        candidates.map((row) => (
                          <button
                            key={row.id}
                            type="button"
                            className="hover:bg-accent/40 flex w-full items-center gap-2 rounded-md border p-2 text-left transition"
                            onClick={() => {
                              give.mutate({ userId: member.user_id, entityId: row.id });
                              setPickerFor(null);
                            }}
                          >
                            <Badge variant="outline">{kindDef(row.kind).label}</Badge>
                            <span className="flex-1 truncate">{row.name}</span>
                            <Eye className="text-muted-foreground size-4" />
                          </button>
                        ))
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null}
            </div>
            {mine.length === 0 ? (
              <p className="text-muted-foreground text-sm">No secret records revealed yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {mine.map((grant) => {
                  const entity = entityById.get(grant.entity_id);
                  return (
                    <span
                      key={grant.id}
                      className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm"
                    >
                      <Link
                        to="/entities/$id"
                        params={{ id: grant.entity_id }}
                        search={{ from: "reveals" }}
                        className="hover:underline"
                      >
                        {entity?.name ?? "Record"}
                      </Link>
                      {isGm ? (
                        <button
                          type="button"
                          aria-label="Remove reveal"
                          onClick={() => revoke.mutate(grant.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
