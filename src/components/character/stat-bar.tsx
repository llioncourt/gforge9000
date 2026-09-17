import type { CharacterSheet } from "@/rules";
import { useT } from "@/i18n/hooks";
import { cn } from "@/lib/utils";

export function PointsBar({ sheet, budget }: { sheet: CharacterSheet; budget: number }) {
  const { t } = useT("characters");
  const { points } = sheet;
  const pct = budget > 0 ? Math.min(100, Math.max(0, (points.total / budget) * 100)) : 0;
  const over = points.remaining < 0;

  const buckets: [string, number][] = [
    [t("sheet.pointsBar.buckets.attributes"), points.attributes],
    [t("sheet.pointsBar.buckets.advantages"), points.advantages],
    [t("sheet.pointsBar.buckets.perks"), points.perks],
    [t("sheet.pointsBar.buckets.disadvantages"), points.disadvantages],
    [t("sheet.pointsBar.buckets.quirks"), points.quirks],
    [t("sheet.pointsBar.buckets.skills"), points.skills],
    [t("sheet.pointsBar.buckets.techniques"), points.techniques],
    [t("sheet.pointsBar.buckets.spells"), points.spells],
    [t("sheet.pointsBar.buckets.other"), points.other],
  ];

  return (
    <div className="panel p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {t("sheet.pointsBar.title")}
          </p>
          <p className="stat-value text-3xl">
            {points.total}
            <span className="text-base text-muted-foreground"> / {budget}</span>
          </p>
        </div>
        <p className={cn("stat-value text-sm", over ? "text-destructive" : "text-success")}>
          {over
            ? t("sheet.pointsBar.overBudget", { count: Math.abs(points.remaining) })
            : t("sheet.pointsBar.unspent", { count: points.remaining })}
        </p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            over ? "bg-destructive" : "bg-primary",
          )}
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
