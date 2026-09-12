import type { CharacterSheet } from "@/rules";
import { cn } from "@/lib/utils";

export function PointsBar({ sheet, budget }: { sheet: CharacterSheet; budget: number }) {
  const { points } = sheet;
  const pct = budget > 0 ? Math.min(100, Math.max(0, (points.total / budget) * 100)) : 0;
  const over = points.remaining < 0;

  const buckets: [string, number][] = [
    ["Attributes", points.attributes],
    ["Advantages", points.advantages],
    ["Perks", points.perks],
    ["Disadvantages", points.disadvantages],
    ["Quirks", points.quirks],
    ["Skills", points.skills],
    ["Techniques", points.techniques],
    ["Spells", points.spells],
    ["Other", points.other],
  ];

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Points spent</p>
          <p className="stat-value text-3xl">
            {points.total}
            <span className="text-base text-muted-foreground"> / {budget}</span>
          </p>
        </div>
        <p className={cn("stat-value text-sm", over ? "text-destructive" : "text-success")}>
          {over ? `${Math.abs(points.remaining)} over budget` : `${points.remaining} unspent`}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", over ? "bg-destructive" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-xs sm:grid-cols-5 lg:grid-cols-9">
        {buckets.map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-muted/20 px-2 py-1.5">
            <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
              {label}
            </p>
            <p className="stat-value text-sm">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
