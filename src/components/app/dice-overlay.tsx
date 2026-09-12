import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Dices, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { prefersReducedMotion, useDice } from "@/components/app/dice-context";
import { outcomeTone } from "@/components/app/dice-tray";
import { simulateToRest } from "@/lib/dice3d";

const DiceBoard = lazy(() => import("@/components/app/dice3d/dice-board"));

/**
 * Compact 3D dice tray. The number reported to the app is always read from the
 * faces the dice actually show; nothing here invents a result.
 */
export function DiceOverlay() {
  const { pending, settled, reportFaces, rerollPending, closeTray } = useDice();
  const [board, setBoard] = useState<{ seed: number; count: number } | null>(null);
  const [reduced, setReduced] = useState(false);
  const handled = useRef<string | null>(null);

  useEffect(() => setReduced(prefersReducedMotion()), []);

  useEffect(() => {
    if (pending) setBoard({ seed: pending.seed, count: pending.count });
  }, [pending]);

  // Reduced motion: run the very same simulation headlessly and settle at once.
  useEffect(() => {
    if (!pending || !reduced || handled.current === pending.id) return;
    handled.current = pending.id;
    let s = pending.seed >>> 0 || 1;
    const rng = () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    const { faces } = simulateToRest(pending.count, rng);
    reportFaces(faces);
  }, [pending, reduced, reportFaces]);

  const open = !!pending || !!settled;
  if (!open || !board) return null;

  return (
    <div className="no-print fixed inset-0 z-[60] flex items-end justify-center bg-background/70 p-3 backdrop-blur-sm sm:items-center">
      <div className="panel w-full max-w-xl overflow-hidden">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Dices className="h-4 w-4 text-primary" />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {pending?.request.label ?? settled?.label}
          </p>
          <Button size="icon" variant="ghost" aria-label="Close dice tray" onClick={closeTray}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="relative h-[280px] w-full bg-muted/20 sm:h-[320px]">
          {reduced ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3">
              <div className="flex gap-2">
                {(settled?.dice ?? []).map((d, i) => (
                  <span
                    key={i}
                    className="stat-value grid h-14 w-14 place-content-center rounded-md border border-border bg-card text-xl"
                  >
                    {d}
                  </span>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Reduced-motion mode: dice are simulated without animation.
              </p>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Loading dice…
                </div>
              }
            >
              <DiceBoard
                key={board.seed}
                count={board.count}
                seed={board.seed}
                onSettled={reportFaces}
              />
            </Suspense>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 px-4 py-3">
          {settled ? (
            <>
              <span className="stat-value text-2xl">{settled.total}</span>
              <span className="text-xs text-muted-foreground">
                {settled.expression} · {settled.dice.join(" + ")}
                {settled.target !== null ? ` · vs ${settled.target}` : ""}
              </span>
              {settled.outcome ? (
                <Badge variant="outline" className={cn(outcomeTone(settled.outcome))}>
                  {settled.outcome}
                  {settled.margin !== null ? ` by ${Math.abs(settled.margin)}` : ""}
                </Badge>
              ) : null}
            </>
          ) : (
            <span className="text-sm text-muted-foreground">Rolling…</span>
          )}
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={rerollPending}
              disabled={!settled}
            >
              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Re-roll
            </Button>
            <Button size="sm" onClick={closeTray}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
