/**
 * Shared dice state: the context, its types and the hook that reads it.
 * The provider component lives in `dice-context.tsx`.
 */
import { createContext, useContext } from "react";
import type { Outcome } from "@/rules";

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

export interface DiceContextValue {
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

export const DiceContext = createContext<DiceContextValue | null>(null);

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useDice() {
  const ctx = useContext(DiceContext);
  if (!ctx) throw new Error("useDice must be used inside DiceProvider");
  return ctx;
}
