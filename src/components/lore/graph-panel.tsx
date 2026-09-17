import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { KINDS, kindDef } from "@/lib/entity-kinds";
import { listEntities, listRelationships, type EntityRow } from "@/lib/lore";
import { useT } from "@/i18n/hooks";

type Node = { id: string; name: string; kind: string; x: number; y: number };
type Edge = { id: string; source: string; target: string; label: string };

const WIDTH = 900;
const HEIGHT = 560;

/** Deterministic seeded pseudo-random so the layout is stable between renders. */
function seeded(index: number, salt: number) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/**
 * Small deterministic force-directed layout: repulsion between every pair,
 * spring attraction along edges, centred in the viewBox.
 */
function layout(rows: EntityRow[], edges: Edge[]): Node[] {
  const nodes: Node[] = rows.map((row, index) => ({
    id: row.id,
    name: row.name,
    kind: row.kind,
    x: WIDTH / 2 + (seeded(index, 1) - 0.5) * WIDTH * 0.7,
    y: HEIGHT / 2 + (seeded(index, 2) - 0.5) * HEIGHT * 0.7,
  }));
  if (nodes.length === 0) return nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = edges
    .map((e) => ({ a: byId.get(e.source), b: byId.get(e.target) }))
    .filter((l): l is { a: Node; b: Node } => Boolean(l.a && l.b));

  const iterations = 220;
  for (let step = 0; step < iterations; step += 1) {
    const cooling = 1 - step / iterations;
    for (let i = 0; i < nodes.length; i += 1) {
      for (let j = i + 1; j < nodes.length; j += 1) {
        const a = nodes[i]!;
        const b = nodes[j]!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.hypot(dx, dy);
        if (dist < 0.01) {
          dx = seeded(i * j, 3) - 0.5;
          dy = seeded(i * j, 4) - 0.5;
          dist = 0.01;
        }
        const force = (9000 / (dist * dist)) * cooling;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.x += fx;
        a.y += fy;
        b.x -= fx;
        b.y -= fy;
      }
    }
    for (const link of links) {
      const dx = link.b.x - link.a.x;
      const dy = link.b.y - link.a.y;
      const dist = Math.max(Math.hypot(dx, dy), 0.01);
      const force = (dist - 150) * 0.02 * cooling;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      link.a.x += fx;
      link.a.y += fy;
      link.b.x -= fx;
      link.b.y -= fy;
    }
    for (const node of nodes) {
      node.x += (WIDTH / 2 - node.x) * 0.004 * cooling;
      node.y += (HEIGHT / 2 - node.y) * 0.004 * cooling;
      node.x = Math.min(WIDTH - 40, Math.max(40, node.x));
      node.y = Math.min(HEIGHT - 30, Math.max(30, node.y));
    }
  }
  return nodes;
}

export function GraphPanel({ campaignId }: { campaignId: string }) {
  const { t } = useT("lore");
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const entities = useQuery({
    queryKey: ["lore-entities", campaignId],
    queryFn: () => listEntities(campaignId),
  });
  const relationships = useQuery({
    queryKey: ["lore-relationships", campaignId],
    queryFn: () => listRelationships(campaignId),
  });

  const rows = useMemo(() => {
    const all = entities.data ?? [];
    const term = search.trim().toLowerCase();
    return all.filter(
      (row) =>
        (!kindFilter || row.kind === kindFilter) &&
        (!term || row.name.toLowerCase().includes(term)),
    );
  }, [entities.data, kindFilter, search]);

  const edges = useMemo<Edge[]>(() => {
    const visible = new Set(rows.map((r) => r.id));
    return (relationships.data ?? [])
      .filter((rel) => visible.has(rel.source_id) && visible.has(rel.target_id))
      .map((rel) => ({
        id: rel.id,
        source: rel.source_id,
        target: rel.target_id,
        label: rel.rel_type,
      }));
  }, [relationships.data, rows]);

  const nodes = useMemo(() => layout(rows, edges), [rows, edges]);
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const kindsPresent = useMemo(() => {
    const set = new Set((entities.data ?? []).map((row) => row.kind));
    return KINDS.filter((k) => set.has(k.kind)).map((k) => k.kind);
  }, [entities.data]);

  const neighbours = useMemo(() => {
    if (!hovered) return new Set<string>();
    const set = new Set<string>([hovered]);
    for (const edge of edges) {
      if (edge.source === hovered) set.add(edge.target);
      if (edge.target === hovered) set.add(edge.source);
    }
    return set;
  }, [edges, hovered]);

  if (entities.isLoading || relationships.isLoading) {
    return <Skeleton className="h-[560px] w-full rounded-lg" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-full sm:w-64"
          placeholder={t("graph.searchPlaceholder")}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button
          size="sm"
          variant={kindFilter ? "outline" : "default"}
          onClick={() => setKindFilter(null)}
        >
          {t("graph.allKinds")}
        </Button>
        {kindsPresent.map((kind) => (
          <Button
            key={kind}
            size="sm"
            variant={kindFilter === kind ? "default" : "outline"}
            onClick={() => setKindFilter(kind)}
          >
            {kindDef(kind).label}
          </Button>
        ))}
      </div>

      {nodes.length === 0 ? (
        <div className="panel p-8 text-center text-sm text-muted-foreground">
          {t("graph.emptyState")}
        </div>
      ) : (
        <div className="panel overflow-hidden p-2">
          <svg
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            className="h-[560px] w-full"
            role="img"
            aria-label={t("graph.ariaLabel")}
          >
            {edges.map((edge) => {
              const a = byId.get(edge.source);
              const b = byId.get(edge.target);
              if (!a || !b) return null;
              const active = !hovered || (neighbours.has(a.id) && neighbours.has(b.id));
              return (
                <g key={edge.id} opacity={active ? 1 : 0.15}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    stroke="currentColor"
                    className="text-border"
                    strokeWidth={1.5}
                  />
                  <text
                    x={(a.x + b.x) / 2}
                    y={(a.y + b.y) / 2 - 4}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[9px]"
                  >
                    {edge.label}
                  </text>
                </g>
              );
            })}
            {nodes.map((node) => {
              const active = !hovered || neighbours.has(node.id);
              return (
                <g
                  key={node.id}
                  opacity={active ? 1 : 0.2}
                  className="cursor-pointer"
                  onMouseEnter={() => setHovered(node.id)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => void navigate({ to: "/entities/$id", params: { id: node.id } })}
                >
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={14}
                    className="fill-primary/20 stroke-primary"
                    strokeWidth={1.5}
                  />
                  <text
                    x={node.x}
                    y={node.y + 28}
                    textAnchor="middle"
                    className="fill-foreground text-[10px]"
                  >
                    {node.name.length > 22 ? `${node.name.slice(0, 21)}…` : node.name}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <p className="text-muted-foreground text-xs">
        <Badge variant="outline" className="mr-2">
          {t("graph.recordCount", { count: nodes.length })}
        </Badge>
        {t("graph.linksHint", { count: edges.length })}
      </p>
    </div>
  );
}
