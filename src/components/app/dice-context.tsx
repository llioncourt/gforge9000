import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { useT } from "@/i18n/hooks";
import { recordRoll } from "@/lib/api";
import { parseDice, resolveSuccess, rollExpression } from "@/rules";
import {
  DiceContext,
  type DiceContextValue,
  type PendingRoll,
  type RollEvent,
  type RollRequest,
} from "@/components/app/dice-state";

const MAX_3D_DICE = 6;

/** Only plain d6 pools are rolled in 3D; everything else uses the parser path. */
function supports3d(expression: string): boolean {
  const parsed = parseDice(expression);
  return !!parsed && parsed.sides === 6 && parsed.count >= 1 && parsed.count <= MAX_3D_DICE;
}

export function DiceProvider({ children }: { children: ReactNode }) {
  const { t } = useT("dice");
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
          ? t("toast.plain", { total, dice: dice.join(" + ") })
          : t("toast.withTarget", {
              total,
              target,
              outcome: t(`outcome.${resolved.outcome}`),
              margin: Math.abs(resolved.margin),
            });
      const message = t("toast.result", { label: request.label, detail });
      if (resolved?.outcome === "critical success") toast.success(message);
      else if (resolved?.outcome === "critical failure" || resolved?.outcome === "failure")
        toast.error(message);
      else toast(message);

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
    [t],
  );

  const roll = useCallback<DiceContextValue["roll"]>(
    (opts) => {
      const expression = opts.expression ?? "3d6";
      const parsed = parseDice(expression);
      if (!parsed) {
        toast.error(t("errors.invalidExpression", { expression }));
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
        toast.error(t("errors.invalidExpression", { expression }));
        return;
      }
      finalize({ ...opts, expression }, result.dice, result.total);
    },
    [finalize, t],
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
