import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { recordRoll } from "@/lib/api";
import { resolveSuccess, rollExpression, type Outcome } from "@/rules";

export interface RollEvent {
  id: string;
  label: string;
  expression: string;
  dice: number[];
  total: number;
  target: number | null;
  margin: number | null;
  outcome: Outcome | null;
  at: string;
}

interface DiceContextValue {
  history: RollEvent[];
  roll: (opts: {
    label: string;
    expression?: string;
    target?: number | null;
    characterId?: string | null;
    campaignId?: string | null;
  }) => RollEvent | null;
  clear: () => void;
}

const DiceContext = createContext<DiceContextValue | null>(null);

export function DiceProvider({ children }: { children: ReactNode }) {
  const [history, setHistory] = useState<RollEvent[]>([]);

  const roll = useCallback<DiceContextValue["roll"]>((opts) => {
    const expression = opts.expression ?? "3d6";
    const result = rollExpression(expression);
    if (!result) {
      toast.error(`Could not read the dice expression "${expression}".`);
      return null;
    }
    const target = opts.target ?? null;
    const resolved = target !== null ? resolveSuccess(result.total, target) : null;
    const event: RollEvent = {
      id: crypto.randomUUID(),
      label: opts.label,
      expression,
      dice: result.dice,
      total: result.total,
      target,
      margin: resolved?.margin ?? null,
      outcome: resolved?.outcome ?? null,
      at: new Date().toISOString(),
    };
    setHistory((prev) => [event, ...prev].slice(0, 50));

    const detail =
      resolved === null
        ? `${result.total} (${result.dice.join(" + ")})`
        : `${result.total} vs ${target} — ${resolved.outcome} by ${Math.abs(resolved.margin)}`;
    if (resolved?.outcome === "critical success") toast.success(`${opts.label}: ${detail}`);
    else if (resolved?.outcome === "critical failure" || resolved?.outcome === "failure")
      toast.error(`${opts.label}: ${detail}`);
    else toast(`${opts.label}: ${detail}`);

    void recordRoll({
      label: opts.label,
      expression,
      dice: result.dice,
      total: result.total,
      target,
      margin: resolved?.margin ?? null,
      outcome: resolved?.outcome ?? null,
      character_id: opts.characterId ?? null,
      campaign_id: opts.campaignId ?? null,
    }).catch(() => undefined);

    return event;
  }, []);

  const value = useMemo(
    () => ({ history, roll, clear: () => setHistory([]) }),
    [history, roll],
  );
  return <DiceContext.Provider value={value}>{children}</DiceContext.Provider>;
}

export function useDice() {
  const ctx = useContext(DiceContext);
  if (!ctx) throw new Error("useDice must be used inside DiceProvider");
  return ctx;
}
