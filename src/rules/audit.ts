/**
 * Machine-readable rules audit. Every mechanic the engine implements is
 * classified so nothing is silently shipped as exact behaviour when it is not.
 *
 * EXACT         — implemented deterministically from first principles and
 *                 verified by tests; no free parameters.
 * CONFIGURABLE  — correct shape, numbers supplied by the ruleset / campaign
 *                 overrides / user content packs.
 * APPROXIMATION — deliberately simplified; technical debt.
 * MISSING       — not implemented; the UI must not imply otherwise.
 */

export type RuleStatus = "EXACT" | "CONFIGURABLE" | "APPROXIMATION" | "MISSING";

export interface RuleAuditEntry {
  id: string;
  area:
    | "attributes"
    | "secondary"
    | "points"
    | "traits"
    | "skills"
    | "equipment"
    | "combat"
    | "dice"
    | "campaign";
  title: string;
  status: RuleStatus;
  /** Where the behaviour lives. */
  implementation: string;
  notes: string;
}

export const RULES_AUDIT: RuleAuditEntry[] = [
  {
    id: "attr.primary-cost",
    area: "attributes",
    title: "ST / DX / IQ / HT point costs",
    status: "CONFIGURABLE",
    implementation: "src/rules/attributes.ts:attributePoints via ruleset.attributeCost",
    notes: "Linear cost per point above/below 10. Defaults 10/20/20/10; campaigns may override.",
  },
  {
    id: "sec.hp-fp-will-per",
    area: "secondary",
    title: "HP, FP, Will, Per derivation and cost",
    status: "CONFIGURABLE",
    implementation: "src/rules/attributes.ts:deriveStats / attributePoints",
    notes: "HP = ST + delta, FP = HT + delta, Will/Per = IQ + delta. Costs 2/3/5/5 per point.",
  },
  {
    id: "sec.basic-speed-move",
    area: "secondary",
    title: "Basic Speed and Basic Move",
    status: "CONFIGURABLE",
    implementation: "src/rules/attributes.ts:deriveStats",
    notes: "Speed = (DX + HT)/4 + delta; Move = floor(Speed) + delta, floored at 0. Speed costs 20/point, Move 5/level.",
  },
  {
    id: "sec.basic-lift",
    area: "secondary",
    title: "Basic Lift",
    status: "CONFIGURABLE",
    implementation: "src/rules/attributes.ts:deriveStats via ruleset.basicLiftDivisor",
    notes: "BL = ST^2 / divisor (default 5) in pounds, fractional precision preserved (ST 11 => 24.2). Divisor configurable.",
  },
  {
    id: "points.total",
    area: "points",
    title: "Point totals and remaining budget",
    status: "EXACT",
    implementation: "src/rules/points.ts:computePoints",
    notes: "Deterministic bucket sum; equipment never contributes points.",
  },
  {
    id: "traits.levels",
    area: "traits",
    title: "Levelled traits",
    status: "EXACT",
    implementation: "src/rules/points.ts:entryCost",
    notes: "Cost = base x levels (minimum 1 level) before modifiers.",
  },
  {
    id: "traits.modifiers",
    area: "traits",
    title: "Enhancements and limitations",
    status: "CONFIGURABLE",
    implementation: "src/rules/points.ts:modifiedCost",
    notes: "Percentages sum, floored at ruleset.modifierFloorPercent (-80%), then rounded per ruleset.modifierRounding.",
  },
  {
    id: "skills.relative-level",
    area: "skills",
    title: "Skill levels by difficulty and points",
    status: "CONFIGURABLE",
    implementation: "src/rules/skills.ts:relativeLevel / skillLevel",
    notes: "1/2/4 points then +1 level per 4; difficulty offsets from ruleset.",
  },
  {
    id: "skills.defaults",
    area: "skills",
    title: "Skill defaults",
    status: "CONFIGURABLE",
    implementation: "src/rules/skills.ts:parseDefaults / bestDefault",
    notes: "Defaults parsed from user text ('DX-5, Brawling-2'); best default wins and a purchased skill is never worse than its default. No default tables bundled.",
  },
  {
    id: "skills.techniques",
    area: "skills",
    title: "Techniques",
    status: "CONFIGURABLE",
    implementation: "src/rules/skills.ts:techniqueLevel",
    notes: "Level = base skill + default penalty + levels bought; bought levels capped by the penalty. Costs from ruleset.technique.",
  },
  {
    id: "equip.encumbrance",
    area: "equipment",
    title: "Encumbrance thresholds, Move and Dodge effects",
    status: "CONFIGURABLE",
    implementation: "src/rules/equipment.ts:computeEncumbrance",
    notes: "Tiers at 1/2/3/6/10 x BL with Move factors 1/0.8/0.6/0.4/0.2 and Dodge 0/-1/-2/-3/-4.",
  },
  {
    id: "equip.dr",
    area: "equipment",
    title: "DR by hit location",
    status: "CONFIGURABLE",
    implementation: "src/rules/equipment.ts:drByLocation via ruleset.drStacking",
    notes: "Aggregates DR of carried armour per declared location (Torso when unspecified). Layering is a policy, not a universal rule: additive by default, 'highest' available. Flexible-armour, ablative and partial-coverage nuances are not modelled.",
  },
  {
    id: "combat.active-defenses",
    area: "combat",
    title: "Dodge, Parry and Block",
    status: "CONFIGURABLE",
    implementation: "src/rules/attributes.ts:deriveStats, src/rules/defenses.ts",
    notes: "Dodge = floor(Basic Speed) + 3. Parry/Block = floor(skill/2) + 3, retreat +3. All from ruleset.activeDefense.",
  },
  {
    id: "combat.basic-damage",
    area: "combat",
    title: "Basic damage (thrust / swing) by ST",
    status: "CONFIGURABLE",
    implementation: "src/rules/damage.ts:basicDamage",
    notes: "Table-driven lookup. No progression is bundled; without one the engine reports 'not-configured' and the sheet shows damage as unavailable. The previous invented formula was removed.",
  },
  {
    id: "combat.health",
    area: "combat",
    title: "Current HP/FP thresholds and conditions",
    status: "CONFIGURABLE",
    implementation: "src/rules/health.ts",
    notes: "Fraction thresholds with labels and Move factors from ruleset.health. Free-text conditions are stored but have no mechanical effect.",
  },
  {
    id: "combat.weapon-parsing",
    area: "combat",
    title: "Weapon field parsing (reach, parry, Acc, bulk, range, RoF, shots, recoil)",
    status: "CONFIGURABLE",
    implementation: "src/rules/weapons.ts:normalizeWeaponMode and the parse* helpers",
    notes: "Unambiguous numeric forms are parsed into typed values; anything else is reported as unresolved and the raw text is preserved. No weapon tables are bundled.",
  },
  {
    id: "combat.damage-expression",
    area: "combat",
    title: "Weapon damage expression resolution",
    status: "CONFIGURABLE",
    implementation: "src/rules/weapons.ts:resolveDamageExpression",
    notes: "thr/sw expressions resolve through the configured damage progression; with none installed the result is 'unavailable' and no roll is offered. Damage type labels are parsed out, not interpreted.",
  },
  {
    id: "combat.ammo",
    area: "combat",
    title: "Shots and ammunition state",
    status: "CONFIGURABLE",
    implementation: "src/rules/weapons.ts:createAmmoState / consumeShots / reloadAmmo",
    notes: "Pure state derived from the Shots field; consumption rejects non-positive and over-capacity amounts and never mutates the weapon definition. Current shots are persisted separately (see combat.ammo-persistence).",
  },
  {
    id: "combat.ammo-persistence",
    area: "combat",
    title: "Persisted current ammunition between sessions",
    status: "CONFIGURABLE",
    implementation: "src/lib/weapon-state.ts + public.character_weapon_state",
    notes: "Current shots are stored in a dedicated table keyed by character, equipment entry and attack-mode key; the static WeaponMode definition is never mutated. Limitation: WeaponMode has no stable id, so the key is derived from the mode index within its entry and reordering modes remaps stored state.",
  },
  {
    id: "combat.rapid-fire",
    area: "combat",
    title: "Rapid fire: RoF, recoil and additional hits",
    status: "CONFIGURABLE",
    implementation: "src/rules/weapons.ts:additionalHits via ruleset.weapon",
    notes: "One extra hit per full multiple of Recoil in the margin of success, capped by shots fired, ammunition on hand and the optional ruleset cap. Without both Recoil and RoF the result is explicitly unavailable.",
  },
  {
    id: "combat.accuracy-bulk",
    area: "combat",
    title: "Accuracy / Aim and Bulk modifiers",
    status: "CONFIGURABLE",
    implementation: "src/rules/weapons.ts:accuracyModifier / bulkModifier",
    notes: "Typed hooks that surface only the values the weapon declares; aiming time, bracing and other maneuvers are not modelled and are not implied by the UI.",
  },
  {
    id: "dice.expressions",
    area: "dice",
    title: "Generic dice expressions",
    status: "EXACT",
    implementation: "src/rules/dice.ts:parseDice / rollExpression",
    notes: "Supports NdS, implicit d6, multipliers and modifiers; multiplier applies after the modifier.",
  },
  {
    id: "dice.success",
    area: "dice",
    title: "3d6 success rolls, criticals and margins",
    status: "CONFIGURABLE",
    implementation: "src/rules/dice.ts:resolveSuccess",
    notes: "<=4 crit success; 5 at target 15+; 6 at target 16+; 18 always crit failure; 17 crit failure at target <=15; margin of failure >= 10 is a crit failure.",
  },
  {
    id: "campaign.overrides",
    area: "campaign",
    title: "Campaign house rules and limits",
    status: "CONFIGURABLE",
    implementation: "src/rules/ruleset.ts:mergeRuleset, src/rules/points.ts:checkLimits",
    notes: "Section-wise merge over the default ruleset; point budget, disadvantage and quirk caps and TL reported as violations.",
  },
];

export const AUDIT_SUMMARY = RULES_AUDIT.reduce<Record<RuleStatus, number>>(
  (acc, e) => ({ ...acc, [e.status]: (acc[e.status] ?? 0) + 1 }),
  { EXACT: 0, CONFIGURABLE: 0, APPROXIMATION: 0, MISSING: 0 },
);

export function auditByStatus(status: RuleStatus): RuleAuditEntry[] {
  return RULES_AUDIT.filter((e) => e.status === status);
}
