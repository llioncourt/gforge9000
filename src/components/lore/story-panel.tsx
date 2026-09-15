import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { KINDS, kindDef } from "@/lib/entity-kinds";
import { createEntity, listEntities, type EntityRow } from "@/lib/lore";
import { EntityDeleteButton } from "@/components/lore/entity-delete-button";

/** Outline spine of the story: each level may hold the next one below it. */
const OUTLINE = ["ARC", "ADVENTURE", "CHAPTER", "SCENE"] as const;

const SIDE_KINDS = KINDS.filter(
  (k) => k.group === "story" && !OUTLINE.includes(k.kind as (typeof OUTLINE)[number]),
).map((k) => k.kind);

function childKindOf(kind: string): string | null {
  const index = OUTLINE.indexOf(kind as (typeof OUTLINE)[number]);
  if (index < 0 || index === OUTLINE.length - 1) return null;
  return OUTLINE[index + 1] ?? null;
}

export function StoryPanel({ campaignId, isGm }: { campaignId: string; isGm: boolean }) {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const entities = useQuery({
    queryKey: ["lore-entities", campaignId],
    queryFn: () => listEntities(campaignId),
  });

  const rows = entities.data ?? [];

  const childrenOf = useMemo(() => {
    const map = new Map<string, EntityRow[]>();
    for (const row of rows) {
      const key = row.parent_id ?? "root";
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return map;
  }, [rows]);

  const roots = useMemo(
    () => rows.filter((row) => row.kind === "ARC" && !row.parent_id),
    [rows],
  );

  const orphans = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.kind !== "ARC" &&
          OUTLINE.includes(row.kind as (typeof OUTLINE)[number]) &&
          (!row.parent_id || !rows.some((other) => other.id === row.parent_id)),
      ),
    [rows],
  );

  const sideGroups = useMemo(
    () =>
      SIDE_KINDS.map((kind) => ({ kind, list: rows.filter((row) => row.kind === kind) })).filter(
        (group) => group.list.length > 0,
      ),
    [rows],
  );

  const create = useMutation({
    mutationFn: (input: { kind: string; parentId: string | null }) =>
      createEntity({
        campaign_id: campaignId,
        kind: input.kind,
        parent_id: input.parentId,
        name: `New ${kindDef(input.kind).label}`,
        status: kindDef(input.kind).defaultStatus,
      }),
    onSuccess: async () => {
      toast.success("Added to the story outline");
      await queryClient.invalidateQueries({ queryKey: ["lore-entities", campaignId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function renderNode(row: EntityRow, depth: number) {
    const child = childKindOf(row.kind);
    const kids = (childrenOf.get(row.id) ?? []).filter((item) =>
      OUTLINE.includes(item.kind as (typeof OUTLINE)[number]),
    );
    const isOpen = !collapsed[row.id];
    return (
      <div key={row.id} className="space-y-2">
        <div
          className="hover:bg-accent/40 flex items-center gap-2 rounded-md border p-2 transition"
          style={{ marginLeft: depth * 20 }}
        >
          {kids.length > 0 ? (
            <button
              type="button"
              aria-label={isOpen ? "Collapse" : "Expand"}
              onClick={() => setCollapsed((prev) => ({ ...prev, [row.id]: isOpen }))}
              className="text-muted-foreground"
            >
              {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          ) : (
            <span className="size-4" />
          )}
          <Badge variant="outline">{kindDef(row.kind).label}</Badge>
          <Link
            to="/entities/$id"
            params={{ id: row.id }}
            search={{ from: "story" }}
            className="flex-1 truncate font-medium hover:underline"
          >
            {row.name}
          </Link>
          <span className="text-muted-foreground text-xs">{row.status}</span>
          {isGm && child ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => create.mutate({ kind: child, parentId: row.id })}
              disabled={create.isPending}
            >
              <Plus className="mr-1 size-3.5" />
              {kindDef(child).label}
            </Button>
          ) : null}
          {isGm ? (
            <EntityDeleteButton campaignId={campaignId} entityId={row.id} name={row.name} />
          ) : null}
        </div>
        {isOpen ? kids.map((kid) => renderNode(kid, depth + 1)) : null}
      </div>
    );
  }

  if (entities.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold tracking-wide uppercase">Story outline</h3>
          {isGm ? (
            <Button
              size="sm"
              onClick={() => create.mutate({ kind: "ARC", parentId: null })}
              disabled={create.isPending}
            >
              <Plus className="mr-2 size-4" /> New arc
            </Button>
          ) : null}
        </div>
        {roots.length === 0 && orphans.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No arcs yet. {isGm ? "Start with an arc, then nest adventures, chapters and scenes." : null}
          </p>
        ) : (
          <div className="space-y-2">
            {roots.map((row) => renderNode(row, 0))}
            {orphans.length > 0 ? (
              <div className="space-y-2 pt-4">
                <h4 className="text-muted-foreground text-xs tracking-wide uppercase">
                  Not in an arc
                </h4>
                {orphans.map((row) => renderNode(row, 0))}
              </div>
            ) : null}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h3 className="text-sm font-semibold tracking-wide uppercase">Threads &amp; secrets</h3>
        {sideGroups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Quests, mysteries, clues and clocks you create will be listed here.
          </p>
        ) : (
          sideGroups.map((group) => (
            <div key={group.kind} className="space-y-2">
              <h4 className="text-muted-foreground text-xs tracking-wide uppercase">
                {kindDef(group.kind).plural}
                <span className="ml-2">{group.list.length}</span>
              </h4>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.list.map((row) => (
                  <Link
                    key={row.id}
                    to="/entities/$id"
                    params={{ id: row.id }}
                    search={{ from: "story" }}
                    className="hover:bg-accent/40 rounded-md border p-2 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{row.name}</span>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground text-xs">{row.status}</span>
                        {isGm ? (
                          <EntityDeleteButton
                            campaignId={campaignId}
                            entityId={row.id}
                            name={row.name}
                          />
                        ) : null}
                      </div>
                    </div>
                    <p className="text-muted-foreground mt-1 line-clamp-2 text-sm">
                      {row.summary ?? row.player_description ?? "No summary yet."}
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          ))
        )}
        {isGm ? (
          <div className="flex flex-wrap gap-2">
            {SIDE_KINDS.map((kind) => (
              <Button
                key={kind}
                size="sm"
                variant="outline"
                onClick={() => create.mutate({ kind, parentId: null })}
                disabled={create.isPending}
              >
                <Plus className="mr-1 size-3.5" /> {kindDef(kind).label}
              </Button>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
