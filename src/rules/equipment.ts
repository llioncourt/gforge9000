import { defaultRuleset, type Ruleset } from "./ruleset";
import type { CharacterEntry, EquipmentData } from "./types";

export interface EncumbranceResult {
  carriedWeight: number;
  totalWeight: number;
  totalCost: number;
  basicLift: number;
  level: number;
  label: string;
  moveFactor: number;
  dodgePenalty: number;
  effectiveMove: number;
  effectiveDodge: number;
}

export function equipmentOf(entries: CharacterEntry[]): CharacterEntry[] {
  return entries.filter((e) => e.kind === "equipment");
}

function asEquipment(entry: CharacterEntry): EquipmentData {
  const d = entry.data as Partial<EquipmentData>;
  return {
    quantity: Number(d.quantity ?? 1),
    weight: Number(d.weight ?? 0),
    cost: Number(d.cost ?? 0),
    carried: d.carried !== false,
    tl: d.tl,
    legality: d.legality,
    dr: Number(d.dr ?? 0),
    locations: d.locations ?? [],
    weapons: d.weapons ?? [],
  };
}

export function computeEncumbrance(
  entries: CharacterEntry[],
  opts: { basicLift: number; basicMove: number; dodge: number },
  rules: Ruleset = defaultRuleset,
): EncumbranceResult {
  let carriedWeight = 0;
  let totalWeight = 0;
  let totalCost = 0;
  for (const entry of equipmentOf(entries)) {
    const e = asEquipment(entry);
    const w = e.weight * e.quantity;
    totalWeight += w;
    totalCost += e.cost * e.quantity;
    if (e.carried) carriedWeight += w;
  }
  const bl = Math.max(1, opts.basicLift);
  // Basic Lift is fractional (ST 11 => 24.2), so a tier boundary must be
  // compared with a tolerance or floating point can push a load up a tier.
  const EPSILON = 1e-9;
  let level = rules.encumbrance.length - 1;
  for (let i = 0; i < rules.encumbrance.length; i++) {
    if (carriedWeight <= bl * rules.encumbrance[i]!.multiplier + EPSILON) {
      level = i;
      break;
    }
  }

  const tier = rules.encumbrance[level]!;
  return {
    carriedWeight: Math.round(carriedWeight * 100) / 100,
    totalWeight: Math.round(totalWeight * 100) / 100,
    totalCost: Math.round(totalCost * 100) / 100,
    basicLift: opts.basicLift,
    level,
    label: tier.label,
    moveFactor: tier.moveFactor,
    dodgePenalty: tier.dodgePenalty,
    effectiveMove: Math.max(0, Math.floor(opts.basicMove * tier.moveFactor)),
    effectiveDodge: opts.dodge + tier.dodgePenalty,
  };
}

/**
 * Damage Resistance per hit location from carried armour.
 *
 * How several layers combine is a **policy**, not a universal truth: flexible
 * layering, partial coverage and ablative rules all differ by setting. The
 * policy is therefore ruleset-driven (`drStacking`), defaulting to additive.
 */
export function drByLocation(
  entries: CharacterEntry[],
  rules: Ruleset = defaultRuleset,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const entry of equipmentOf(entries)) {
    const e = asEquipment(entry);
    if (!e.carried || !e.dr) continue;
    const locations = e.locations?.length ? e.locations : ["Torso"];
    for (const loc of locations) {
      const prev = out[loc] ?? 0;
      out[loc] = rules.drStacking === "highest" ? Math.max(prev, e.dr) : prev + e.dr;
    }
  }
  return out;
}
