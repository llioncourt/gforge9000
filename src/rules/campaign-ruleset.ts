/**
 * Campaign-level ruleset overrides.
 *
 * The rules audit classifies many mechanics as CONFIGURABLE: the calculation
 * shape is exact, but the numbers come from the ruleset. This module exposes
 * exactly those numbers as an editable, persisted, per-campaign override set.
 *
 * Nothing here invents a rule: every field maps 1:1 to a `Ruleset` member that
 * the engine already reads. Unset fields fall back to `defaultRuleset`.
 */
import { defaultRuleset, mergeRuleset, type Ruleset } from "./ruleset";

/** Key used inside `campaigns.settings`. */
export const CAMPAIGN_RULESET_SETTING = "ruleset_overrides";

export type RulesetFieldKind = "number" | "integer" | "boolean" | "enum" | "nullableInteger";

export type RulesetGroup =
  | "attributes"
  | "secondary"
  | "skills"
  | "modifiers"
  | "combat"
  | "encumbrance"
  | "health"
  | "dice"
  | "weapons";

export interface RulesetField {
  /** Dot path inside `Ruleset`, e.g. `activeDefense.parryBase`. */
  path: string;
  group: RulesetGroup;
  kind: RulesetFieldKind;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
}

const DIFFICULTIES = ["E", "A", "H", "VH"] as const;

export const RULESET_FIELDS: RulesetField[] = [
  ...(["ST", "DX", "IQ", "HT"] as const).map<RulesetField>((k) => ({
    path: `attributeCost.${k}`,
    group: "attributes",
    kind: "integer",
    min: 0,
  })),
  ...(["hp", "will", "per", "fp", "speed", "move"] as const).map<RulesetField>((k) => ({
    path: `secondaryCost.${k}`,
    group: "secondary",
    kind: "integer",
    min: 0,
  })),
  { path: "basicLiftDivisor", group: "secondary", kind: "number", min: 0.1, step: 0.1 },
  ...DIFFICULTIES.map<RulesetField>((d) => ({
    path: `difficultyOffset.${d}`,
    group: "skills",
    kind: "integer",
    min: -10,
    max: 0,
  })),
  ...DIFFICULTIES.map<RulesetField>((d) => ({
    path: `technique.firstLevelCost.${d}`,
    group: "skills",
    kind: "integer",
    min: 0,
  })),
  ...DIFFICULTIES.map<RulesetField>((d) => ({
    path: `technique.additionalLevelCost.${d}`,
    group: "skills",
    kind: "integer",
    min: 0,
  })),
  {
    path: "modifierRounding",
    group: "modifiers",
    kind: "enum",
    options: ["nearest", "up", "down"],
  },
  { path: "modifierFloorPercent", group: "modifiers", kind: "integer", min: -100, max: 0 },
  { path: "dodgeBase", group: "combat", kind: "integer", min: 0 },
  { path: "activeDefense.parryDivisor", group: "combat", kind: "number", min: 0.5, step: 0.5 },
  { path: "activeDefense.parryBase", group: "combat", kind: "integer" },
  { path: "activeDefense.blockDivisor", group: "combat", kind: "number", min: 0.5, step: 0.5 },
  { path: "activeDefense.blockBase", group: "combat", kind: "integer" },
  { path: "activeDefense.retreatBonus", group: "combat", kind: "integer" },
  { path: "drStacking", group: "combat", kind: "enum", options: ["additive", "highest"] },
  { path: "criticalSuccessMax", group: "dice", kind: "integer", min: 3, max: 18 },
  { path: "criticalFailureMin", group: "dice", kind: "integer", min: 3, max: 18 },
  { path: "autoFailMargin", group: "dice", kind: "integer", min: 1 },
  { path: "weapon.minimumRecoil", group: "weapons", kind: "integer", min: 0 },
  { path: "weapon.maxAdditionalHits", group: "weapons", kind: "nullableInteger", min: 0 },
  { path: "weapon.accuracyBonusEnabled", group: "weapons", kind: "boolean" },
  { path: "weapon.bulkPenaltyEnabled", group: "weapons", kind: "boolean" },
  ...defaultRuleset.encumbrance.flatMap<RulesetField>((_tier, i) => [
    {
      path: `encumbrance.${i}.multiplier`,
      group: "encumbrance",
      kind: "number",
      min: 0,
      step: 0.1,
    },
    {
      path: `encumbrance.${i}.moveFactor`,
      group: "encumbrance",
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
    },
    { path: `encumbrance.${i}.dodgePenalty`, group: "encumbrance", kind: "integer", max: 0 },
  ]),
  ...defaultRuleset.health.hpThresholds.flatMap<RulesetField>((_row, i) => [
    { path: `health.hpThresholds.${i}.atOrBelow`, group: "health", kind: "number", step: 0.01 },
    {
      path: `health.hpThresholds.${i}.moveFactor`,
      group: "health",
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
    },
  ]),
  ...defaultRuleset.health.fpThresholds.flatMap<RulesetField>((_row, i) => [
    { path: `health.fpThresholds.${i}.atOrBelow`, group: "health", kind: "number", step: 0.01 },
    {
      path: `health.fpThresholds.${i}.moveFactor`,
      group: "health",
      kind: "number",
      min: 0,
      max: 1,
      step: 0.05,
    },
  ]),
];

export const RULESET_GROUPS: RulesetGroup[] = [
  "attributes",
  "secondary",
  "skills",
  "modifiers",
  "combat",
  "encumbrance",
  "health",
  "dice",
  "weapons",
];

type Unknown = Record<string, unknown>;

export function getAtPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    return (acc as Unknown)[key];
  }, source);
}

/** Returns a structural copy of `source` with `path` set to `value`. */
export function setAtPath<T>(source: T, path: string, value: unknown): T {
  const keys = path.split(".");
  const clone = (node: unknown): unknown =>
    Array.isArray(node)
      ? [...node]
      : node && typeof node === "object"
        ? { ...(node as Unknown) }
        : node;
  const root = clone(source) as Unknown;
  let cursor: Unknown = root;
  for (let i = 0; i < keys.length - 1; i += 1) {
    const key = keys[i]!;
    const next = clone(cursor[key]);
    cursor[key] = next;
    cursor = next as Unknown;
  }
  cursor[keys[keys.length - 1]!] = value;
  return root as T;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Only the top-level sections that differ from the defaults. */
export function overridesFromRuleset(rules: Ruleset): Partial<Ruleset> {
  const out: Unknown = {};
  for (const key of Object.keys(defaultRuleset) as (keyof Ruleset)[]) {
    if (!deepEqual(rules[key], defaultRuleset[key])) out[key] = rules[key];
  }
  return out as Partial<Ruleset>;
}

export function overridesFromSettings(settings: unknown): Partial<Ruleset> {
  const raw = (settings as Unknown | null | undefined)?.[CAMPAIGN_RULESET_SETTING];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as Partial<Ruleset>;
}

/** Effective ruleset for a campaign (defaults when it has no overrides). */
export function rulesetFromSettings(settings: unknown): Ruleset {
  return mergeRuleset(defaultRuleset, overridesFromSettings(settings));
}

/** Paths whose value differs from the default — used to flag edited fields. */
export function changedPaths(rules: Ruleset): string[] {
  return RULESET_FIELDS.filter(
    (f) => !deepEqual(getAtPath(rules, f.path), getAtPath(defaultRuleset, f.path)),
  ).map((f) => f.path);
}

/** Coerces raw form input for a field; returns null when the input is unusable. */
export function coerceFieldValue(field: RulesetField, raw: string | boolean): unknown | null {
  if (field.kind === "boolean") return raw === true || raw === "true";
  if (field.kind === "enum") {
    const value = String(raw);
    return field.options?.includes(value) ? value : null;
  }
  const text = String(raw).trim();
  if (field.kind === "nullableInteger" && text === "") return null;
  if (text === "") return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  const value = field.kind === "integer" || field.kind === "nullableInteger" ? Math.trunc(n) : n;
  if (field.min !== undefined && value < field.min) return field.min;
  if (field.max !== undefined && value > field.max) return field.max;
  return value;
}
