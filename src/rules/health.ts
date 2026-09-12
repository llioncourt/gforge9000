/**
 * Current HP/FP state. Thresholds are fractions of maximum HP/FP and live in
 * the ruleset so a campaign can redefine them. CONFIGURABLE, not a
 * reproduction of any published table.
 */
import { defaultRuleset, type Ruleset } from "./ruleset";

export interface HealthState {
  current: number;
  max: number;
  /** current / max, may be negative. */
  fraction: number;
  /** Label of the deepest threshold reached, or null while unharmed. */
  label: string | null;
  /** Move/Dodge multiplier implied by the threshold (1 = unaffected). */
  moveFactor: number;
}

function evaluate(
  current: number,
  max: number,
  thresholds: { atOrBelow: number; label: string; moveFactor: number }[],
): HealthState {
  const safeMax = Math.max(1, max);
  const fraction = current / safeMax;
  let hit: { atOrBelow: number; label: string; moveFactor: number } | null = null;
  for (const t of [...thresholds].sort((a, b) => b.atOrBelow - a.atOrBelow)) {
    if (fraction <= t.atOrBelow) hit = t;
  }
  return {
    current,
    max: safeMax,
    fraction,
    label: hit?.label ?? null,
    moveFactor: hit?.moveFactor ?? 1,
  };
}

export function hpState(current: number | null | undefined, max: number, rules: Ruleset = defaultRuleset) {
  return evaluate(current ?? max, max, rules.health.hpThresholds);
}

export function fpState(current: number | null | undefined, max: number, rules: Ruleset = defaultRuleset) {
  return evaluate(current ?? max, max, rules.health.fpThresholds);
}
