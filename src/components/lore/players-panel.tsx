import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Eye, Plus, Sparkles, X } from "lucide-react";
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
import { listCampaignCharacters, listMembers } from "@/lib/api";
import { dataValue, listCampaignGrants, listEntities, type EntityRow } from "@/lib/lore";
import { revealEntityToPlayer, revokeEntityReveal } from "@/lib/reveal";
import { EntityThumb } from "@/components/lore/entity-thumb";
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

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["lore-grants", campaignId] });
    await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
  };

  const give = useMutation({
    mutationFn: async (input: { userId: string; entityId: string }) => {
      const entity = entityById.get(input.entityId);
      if (!entity) throw new Error("Record not found");
      return revealEntityToPlayer({ entity, userId: input.userId, gmId: user!.id });
    },
    onSuccess: async (result) => {
      if (result.alreadyPublic) {
        toast.success("Revealed — this record was already visible to every player");
      } else if (result.promotedTo) {
        toast.success("Revealed to the player (visibility set to “Selected players”)");
      } else {
        toast.success("Revealed to the player");
      }
      await invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: async (input: { grantId: string; entityId: string }) => {
      const remaining = (grants.data ?? []).filter(
        (g) => g.entity_id === input.entityId && g.id !== input.grantId,
      ).length;
      return revokeEntityReveal({
        grantId: input.grantId,
        entity: entityById.get(input.entityId),
        remainingGrants: remaining,
      });
    },
    onSuccess: async (result) => {
      toast.success(result.demoted ? "Reveal removed — record is GM only again" : "Reveal removed");
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

  // Players get their own revealed records as rich cards — no player wrapper card.
  if (!isGm) {
    const mine = (grants.data ?? [])
      .filter((g) => g.user_id === user?.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const portraitFor = (entity: EntityRow | undefined) => {
      if (!entity) return null;
      const sheetId = dataValue(entity, "character_sheet_id");
      if (!sheetId) return null;
      return (
        (characters.data ?? []).find((c) => c.id === sheetId)?.portrait_path ?? null
      );
    };
    return (
      <div className="space-y-4">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <Sparkles className="text-primary size-4" />
          These are the secret records the GM has revealed to you.
        </p>
        {mine.length === 0 ? (
          <div className="panel text-muted-foreground p-8 text-center text-sm">
            No secret records revealed yet — when the GM shares one, it appears here.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {mine.map((grant) => {
              const entity = entityById.get(grant.entity_id);
              return (
                <Link
                  key={grant.id}
                  to="/entities/$id"
                  params={{ id: grant.entity_id }}
                  search={{ from: "reveals" }}
                  className="group hover:border-primary/50 hover:bg-accent/30 block rounded-lg border p-3 transition"
                >
                  <div className="flex items-start gap-3">
                    <EntityThumb
                      path={entity?.image_url}
                      fallbackPath={portraitFor(entity)}
                      name={entity?.name ?? "Record"}
                      className="size-14"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span className="group-hover:text-primary truncate font-medium">
                          {entity?.name ?? "Record"}
                        </span>
                        <ChevronRight className="text-muted-foreground group-hover:text-primary mt-0.5 size-4 shrink-0 transition group-hover:translate-x-0.5" />
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase">
                          {kindDef(entity?.kind ?? "note").label}
                        </Badge>
                        <span className="text-muted-foreground text-xs">
                          Revealed {new Date(grant.created_at).toLocaleDateString()}
                        </span>
                      </div>
                      {entity?.summary ? (
                        <p className="text-muted-foreground mt-1.5 line-clamp-2 text-sm">
                          {entity.summary}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // The GM sees every player except themselves.
  const rows = (members.data ?? []).filter(
    (member) => member.role !== "gm" && member.user_id !== user?.id,
  );

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        {isGm
          ? "Secret records stay hidden until you reveal them here. Public records are always visible."
          : "These are the secret records the GM has revealed to you."}
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
                            <VisibilityBadge visibility={row.visibility} isGm={isGm} />
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
                          onClick={() =>
                            revoke.mutate({ grantId: grant.id, entityId: grant.entity_id })
                          }
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
