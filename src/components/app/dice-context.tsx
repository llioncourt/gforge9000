import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { recordRoll } from "@/lib/api";
import { parseDice, resolveSuccess, rollExpression, type Outcome } from "@/rules";

export interface RollEvent {
  id: string;
  label: string;
  expression: string;
  dice: number[];
  total: number;
  target: number | null;
  margin: number | null;
  outcome: Outcome | null;
  contextKey: string | null;
  characterId: string | null;
  campaignId: string | null;
  at: string;
}

export interface RollRequest {
  label: string;
  expression?: string;
  target?: number | null;
  characterId?: string | null;
  campaignId?: string | null;
  /** Optional UI identity used to associate the settled result with its source control. */
  contextKey?: string;
}

/** A roll waiting for the 3D dice to settle. */
export interface PendingRoll {
  id: string;
  seed: number;
  count: number;
  modifier: number;
  multiplier: number;
  request: Required<Pick<RollRequest, "label">> & RollRequest & { expression: string };
}

interface DiceContextValue {
  history: RollEvent[];
  roll: (opts: RollRequest) => void;
  clear: () => void;
  /** Roll currently tumbling in the 3D tray, if any. */
  pending: PendingRoll | null;
  /** Result of the last settled 3D roll, shown in the overlay. */
  settled: RollEvent | null;
  /** Called by the 3D tray with the faces read off the settled dice. */
  reportFaces: (faces: number[]) => void;
  rerollPending: () => void;
  closeTray: () => void;
}

const DiceContext = createContext<DiceContextValue | null>(null);

const MAX_3D_DICE = 6;

/** Only plain d6 pools are rolled in 3D; everything else uses the parser path. */
export function supports3d(expression: string): boolean {
  const parsed = parseDice(expression);
  return !!parsed && parsed.sides === 6 && parsed.count >= 1 && parsed.count <= MAX_3D_DICE;
}

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function DiceProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<RollEvent[]>([]);
  const [pending, setPending] = useState<PendingRoll | null>(null);
  const [settled, setSettled] = useState<RollEvent | null>(null);

  const finalize = useCallback(
    (request: RollRequest & { expression: string }, dice: number[], total: number) => {
      const target = request.target ?? null;
      const resolved = target !== null ? resolveSuccess(total, target) : null;
      const event: RollEvent = {
        id: crypto.randomUUID(),
        label: request.label,
        expression: request.expression,
        dice,
        total,
        target,
        margin: resolved?.margin ?? null,
        outcome: resolved?.outcome ?? null,
        contextKey: request.contextKey ?? null,
        characterId: request.characterId ?? null,
        campaignId: request.campaignId ?? null,
        at: new Date().toISOString(),
      };
      setHistory((prev) => [event, ...prev].slice(0, 50));

      const detail =
        resolved === null
          ? `${total} (${dice.join(" + ")})`
          : `${total} vs ${target} — ${resolved.outcome} by ${Math.abs(resolved.margin)}`;
      if (resolved?.outcome === "critical success") toast.success(`${request.label}: ${detail}`);
      else if (resolved?.outcome === "critical failure" || resolved?.outcome === "failure")
        toast.error(`${request.label}: ${detail}`);
      else toast(`${request.label}: ${detail}`);

      void recordRoll({
        label: request.label,
        expression: request.expression,
        dice,
        total,
        target,
        margin: resolved?.margin ?? null,
        outcome: resolved?.outcome ?? null,
        character_id: request.characterId ?? null,
        campaign_id: request.campaignId ?? null,
      }).catch(() => undefined);

      return event;
    },
    [],
  );

  const roll = useCallback<DiceContextValue["roll"]>(
    (opts) => {
      const expression = opts.expression ?? "3d6";
      const parsed = parseDice(expression);
      if (!parsed) {
        toast.error(`Could not read the dice expression "${expression}".`);
        return;
      }
      if (supports3d(expression)) {
        setSettled(null);
        setPending({
          id: crypto.randomUUID(),
          seed: (Math.random() * 0xffffffff) >>> 0 || 1,
          count: parsed.count,
          modifier: parsed.modifier,
          multiplier: parsed.multiplier,
          request: { ...opts, expression },
        });
        return;
      }
      const result = rollExpression(expression);
      if (!result) {
        toast.error(`Could not read the dice expression "${expression}".`);
        return;
      }
      finalize({ ...opts, expression }, result.dice, result.total);
    },
    [finalize],
  );

  const reportFaces = useCallback(
    (faces: number[]) => {
      setPending((current) => {
        if (!current) return null;
        const sum = faces.reduce((a, b) => a + b, 0);
        const total = (sum + current.modifier) * current.multiplier;
        const event = finalize(current.request, faces, total);
        setSettled(event);
        return null;
      });
    },
    [finalize],
  );

  const rerollPending = useCallback(() => {
    setSettled((last) => {
      if (last) {
        setPending({
          id: crypto.randomUUID(),
          seed: (Math.random() * 0xffffffff) >>> 0 || 1,
          count: parseDice(last.expression)?.count ?? 3,
          modifier: parseDice(last.expression)?.modifier ?? 0,
          multiplier: parseDice(last.expression)?.multiplier ?? 1,
          request: {
            label: last.label,
            expression: last.expression,
            target: last.target,
            characterId: last.characterId,
            campaignId: last.campaignId,
            ...(last.contextKey ? { contextKey: last.contextKey } : {}),
          },
        });
      }
      return null;
    });
  }, []);

  const closeTray = useCallback(() => {
    setPending(null);
    setSettled(null);
  }, []);

  const value = useMemo(
    () => ({
      history,
      roll,
      clear: () => setHistory([]),
      pending,
      settled,
      reportFaces,
      rerollPending,
      closeTray,
    }),
    [history, roll, pending, settled, reportFaces, rerollPending, closeTray],
  );
  return <DiceContext.Provider value={value}>{children}</DiceContext.Provider>;
}

export function useDice() {
  const ctx = useContext(DiceContext);
  if (!ctx) throw new Error("useDice must be used inside DiceProvider");
  return ctx;
}
