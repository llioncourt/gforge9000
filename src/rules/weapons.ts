/**
 * Weapon / attack-mode calculations.
 *
 * Pure and data-driven. Parsing (turning free text stored on a WeaponMode into
 * structured values) is kept separate from resolution (deciding what can
 * actually be rolled). Anything the engine cannot read unambiguously is
 * reported as `unresolved`; anything that needs data the engine does not ship
 * (e.g. a basic damage progression) is reported as `unavailable`. Nothing here
 * guesses a value.
 */
import { basicDamage, type BasicDamage, type DamageProgression } from "./damage";
import { parseDice } from "./dice";
import { defaultRuleset, type Ruleset } from "./ruleset";
import type { WeaponMode } from "./types";

export type ParseStatus = "resolved" | "unresolved" | "unconfigured";

export interface Parsed<T> {
  status: ParseStatus;
  /** Present only when status === "resolved". */
  value: T | null;
  /** Original text, preserved verbatim so the UI can still display it. */
  raw: string | null;
}

function resolved<T>(value: T, raw: string): Parsed<T> {
  return { status: "resolved", value, raw };
}
function unresolved<T>(raw: string): Parsed<T> {
  return { status: "unresolved", value: null, raw };
}
function unconfigured<T>(): Parsed<T> {
  return { status: "unconfigured", value: null, raw: null };
}

function text(raw: string | undefined | null): string | null {
  const t = (raw ?? "").trim();
  return t.length ? t : null;
}

/* ------------------------------------------------------------------ *
 * Parsing
 * ------------------------------------------------------------------ */

export interface RateOfFire {
  /** Shots expended by one attack. */
  shotsPerAttack: number;
  /** True for "3x10" style multi-projectile notation. */
  multiProjectile: boolean;
  /** Projectiles per shot when multiProjectile. */
  projectilesPerShot: number;
  /** True for the trailing "!" marker (jet / continuous fire). Carried, not interpreted. */
  jet: boolean;
}

/**
 * Accepts "1", "3", "10", "3x9" and a trailing "!" marker. Anything else
 * (ranges, prose, slashes) stays unresolved rather than being guessed.
 */
export function parseRoF(raw?: string | null): Parsed<RateOfFire> {
  const t = text(raw);
  if (!t) return unconfigured();
  const m = /^(\d+)(?:\s*[x*]\s*(\d+))?\s*(!?)$/i.exec(t);
  if (!m) return unresolved(t);
  const shots = parseInt(m[1]!, 10);
  if (shots < 1) return unresolved(t);
  const projectiles = m[2] ? parseInt(m[2], 10) : 1;
  return resolved(
    {
      shotsPerAttack: shots,
      multiProjectile: Boolean(m[2]),
      projectilesPerShot: projectiles,
      jet: m[3] === "!",
    },
    t,
  );
}

/** Recoil must be a positive integer to be usable in any calculation. */
export function parseRecoil(raw?: string | null, rules: Ruleset = defaultRuleset): Parsed<number> {
  const t = text(raw);
  if (!t) return unconfigured();
  const m = /^(\d+)$/.exec(t);
  if (!m) return unresolved(t);
  const value = parseInt(m[1]!, 10);
  if (value < rules.weapon.minimumRecoil) return unresolved(t);
  return resolved(value, t);
}

export interface ShotsSpec {
  capacity: number;
  /** Reload time in seconds when the "(3)" suffix is present. */
  reloadTime: number | null;
}

/** Accepts "8", "30(3)", "1(20)". Anything else is unresolved. */
export function parseShots(raw?: string | null): Parsed<ShotsSpec> {
  const t = text(raw);
  if (!t) return unconfigured();
  const m = /^(\d+)\s*(?:\(\s*(\d+)\s*\))?$/.exec(t);
  if (!m) return unresolved(t);
  return resolved(
    { capacity: parseInt(m[1]!, 10), reloadTime: m[2] ? parseInt(m[2], 10) : null },
    t,
  );
}

export interface RangeSpec {
  /** Short/half range, when the value uses the "short/max" form. */
  short: number | null;
  max: number;
}

/** Accepts "120", "100/1500". Multiplier forms ("x10") stay unresolved. */
export function parseRange(raw?: string | null): Parsed<RangeSpec> {
  const t = text(raw);
  if (!t) return unconfigured();
  const pair = /^(\d+)\s*\/\s*(\d+)$/.exec(t);
  if (pair) return resolved({ short: parseInt(pair[1]!, 10), max: parseInt(pair[2]!, 10) }, t);
  const single = /^(\d+)$/.exec(t);
  if (single) return resolved({ short: null, max: parseInt(single[1]!, 10) }, t);
  return unresolved(t);
}

/** Signed integer fields such as Accuracy and Bulk ("2", "-4", "+1"). */
export function parseSignedNumber(raw?: string | null): Parsed<number> {
  const t = text(raw);
  if (!t) return unconfigured();
  const m = /^([+-]?\d+)$/.exec(t);
  if (!m) return unresolved(t);
  return resolved(parseInt(m[1]!, 10), t);
}

export interface ReachSpec {
  /** "C" (close) entries are kept as 0 with `close` true. */
  close: boolean;
  distances: number[];
}

/** Accepts "1", "1,2", "C,1". Everything else is unresolved. */
export function parseReach(raw?: string | null): Parsed<ReachSpec> {
  const t = text(raw);
  if (!t) return unconfigured();
  const parts = t.split(/\s*[,*]\s*/).filter(Boolean);
  if (!parts.length) return unresolved(t);
  let close = false;
  const distances: number[] = [];
  for (const part of parts) {
    if (/^c$/i.test(part)) {
      close = true;
      continue;
    }
    if (/^\d+$/.test(part)) {
      distances.push(parseInt(part, 10));
      continue;
    }
    return unresolved(t);
  }
  return resolved({ close, distances }, t);
}

/** Parry field: "0", "-2", "11", "No"/"None". Skill-derived parry stays in ./defenses.ts. */
export function parseParry(raw?: string | null): Parsed<number | "none"> {
  const t = text(raw);
  if (!t) return unconfigured();
  if (/^(no|none)$/i.test(t)) return resolved("none", t);
  const m = /^([+-]?\d+)$/.exec(t);
  if (!m) return unresolved(t);
  return resolved(parseInt(m[1]!, 10), t);
}

/* ------------------------------------------------------------------ *
 * Ammunition state (never stored on the static WeaponMode)
 * ------------------------------------------------------------------ */

export interface AmmoState {
  capacity: number;
  current: number;
  reloadTime: number | null;
}

export type AmmoOutcome =
  | { ok: true; state: AmmoState; consumed: number }
  | { ok: false; reason: "invalid-amount" | "insufficient-shots"; state: AmmoState };

export function createAmmoState(spec: ShotsSpec, current?: number): AmmoState {
  const start = current === undefined ? spec.capacity : current;
  return {
    capacity: spec.capacity,
    current: Math.min(Math.max(0, Math.floor(start)), spec.capacity),
    reloadTime: spec.reloadTime,
  };
}

export function isEmpty(state: AmmoState): boolean {
  return state.current <= 0;
}

/** Pure: returns a new state, never mutates the input or the weapon definition. */
export function consumeShots(state: AmmoState, amount: number): AmmoOutcome {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount))
    return { ok: false, reason: "invalid-amount", state };
  if (amount > state.current) return { ok: false, reason: "insufficient-shots", state };
  return { ok: true, state: { ...state, current: state.current - amount }, consumed: amount };
}

export function reloadAmmo(state: AmmoState, amount?: number): AmmoState {
  if (amount === undefined) return { ...state, current: state.capacity };
  if (!Number.isFinite(amount) || amount <= 0) return state;
  return { ...state, current: Math.min(state.capacity, state.current + Math.floor(amount)) };
}

/* ------------------------------------------------------------------ *
 * Rapid fire
 * ------------------------------------------------------------------ */

export type AdditionalHits =
  | { status: "resolved"; hits: number; cappedBy: "rof" | "shots" | "margin" | "limit" }
  | { status: "unavailable"; reason: "no-recoil" | "no-rof" | "not-rapid-fire" | "miss" };

/**
 * Additional hits from a successful rapid-fire attack:
 * one extra hit per full multiple of Recoil in the margin of success, capped by
 * the shots actually fired, by ammunition on hand, and by an optional
 * ruleset cap. Requires both Recoil and RoF; otherwise explicitly unavailable.
 */
export function additionalHits(
  opts: {
    margin: number;
    recoil: Parsed<number> | number | null;
    rof: Parsed<RateOfFire> | number | null;
    shotsAvailable?: number | null;
  },
  rules: Ruleset = defaultRuleset,
): AdditionalHits {
  const recoil =
    typeof opts.recoil === "number"
      ? opts.recoil
      : opts.recoil && opts.recoil.status === "resolved"
        ? opts.recoil.value
        : null;
  const rof =
    typeof opts.rof === "number"
      ? opts.rof
      : opts.rof && opts.rof.status === "resolved"
        ? (opts.rof.value?.shotsPerAttack ?? null)
        : null;
  if (recoil === null || recoil < rules.weapon.minimumRecoil)
    return { status: "unavailable", reason: "no-recoil" };
  if (rof === null) return { status: "unavailable", reason: "no-rof" };
  if (rof < 2) return { status: "unavailable", reason: "not-rapid-fire" };
  if (opts.margin < 0) return { status: "unavailable", reason: "miss" };

  const fired =
    opts.shotsAvailable === null || opts.shotsAvailable === undefined
      ? rof
      : Math.min(rof, Math.max(0, Math.floor(opts.shotsAvailable)));
  const fromMargin = Math.floor(opts.margin / recoil);
  let cappedBy: "rof" | "shots" | "margin" | "limit" = "margin";
  let hits = fromMargin;
  if (fired - 1 < hits) {
    hits = Math.max(0, fired - 1);
    cappedBy = fired < rof ? "shots" : "rof";
  }
  const limit = rules.weapon.maxAdditionalHits;
  if (limit !== null && hits > limit) {
    hits = limit;
    cappedBy = "limit";
  }
  return { status: "resolved", hits, cappedBy };
}

/* ------------------------------------------------------------------ *
 * Damage expression resolution
 * ------------------------------------------------------------------ */

export type DamageResolution =
  | {
      status: "rollable";
      expression: string;
      damageType: string | null;
      raw: string;
      usedBasicDamage: boolean;
    }
  | { status: "unavailable"; reason: "no-progression" | "out-of-range"; raw: string }
  | { status: "unresolved"; raw: string }
  | { status: "unconfigured"; raw: null };

const BASIC_TOKEN = /\b(thr|thrust|sw|swing)\b/gi;

/**
 * Turns a stored damage string into something the dice parser can actually
 * roll. `thr+1 cr` needs a configured basic damage progression: with none
 * installed the result is `unavailable` and the UI must not offer a roll.
 */
export function resolveDamageExpression(
  raw: string | undefined | null,
  opts: { st?: number; progression?: DamageProgression | null; damage?: BasicDamage } = {},
): DamageResolution {
  const t = text(raw);
  if (!t) return { status: "unconfigured", raw: null };

  // Split a trailing damage-type label ("cr", "imp", "2 pi-"), keeping it typed.
  const typeMatch = /\s+([a-z][a-z+-]*)\s*$/i.exec(t);
  let core = t;
  let damageType: string | null = null;
  if (typeMatch && !/^d\d*$/i.test(typeMatch[1]!)) {
    core = t.slice(0, typeMatch.index).trim();
    damageType = typeMatch[1]!;
  }

  let usedBasicDamage = false;
  if (BASIC_TOKEN.test(core)) {
    BASIC_TOKEN.lastIndex = 0;
    const basic =
      opts.damage ??
      (opts.st === undefined
        ? { status: "not-configured" as const, thrust: null, swing: null, source: null }
        : basicDamage(opts.st, opts.progression ?? null));
    if (basic.status !== "configured" || !basic.thrust || !basic.swing) {
      return {
        status: "unavailable",
        reason: basic.status === "out-of-range" ? "out-of-range" : "no-progression",
        raw: t,
      };
    }
    usedBasicDamage = true;
    core = core.replace(BASIC_TOKEN, (token) =>
      /^(thr|thrust)$/i.test(token) ? basic.thrust! : basic.swing!,
    );
  }

  core = core.replace(/\s+/g, "");
  const folded = foldModifiers(core);
  if (!folded || !parseDice(folded)) return { status: "unresolved", raw: t };
  return { status: "rollable", expression: folded, damageType, raw: t, usedBasicDamage };
}

/** Collapses "1d-2+1" into a single modifier so the dice parser can read it. */
function foldModifiers(expr: string): string | null {
  const m = /^(\d*d\d*)((?:[+-]\d+)*)((?:[x*]\d+)?)$/i.exec(expr);
  if (!m) return expr;
  const mods = (m[2] ?? "").match(/[+-]\d+/g) ?? [];
  const total = mods.reduce((a, b) => a + parseInt(b, 10), 0);
  const sign = total === 0 ? "" : total > 0 ? `+${total}` : String(total);
  return `${m[1]}${m[3] ?? ""}${sign}`;
}

/* ------------------------------------------------------------------ *
 * Normalization
 * ------------------------------------------------------------------ */

export interface NormalizedWeapon {
  name: string;
  skill: string | null;
  damage: DamageResolution;
  reach: Parsed<ReachSpec>;
  parry: Parsed<number | "none">;
  accuracy: Parsed<number>;
  bulk: Parsed<number>;
  range: Parsed<RangeSpec>;
  rof: Parsed<RateOfFire>;
  shots: Parsed<ShotsSpec>;
  recoil: Parsed<number>;
  /** True when the mode carries ranged data worth tracking ammunition for. */
  ranged: boolean;
  ammo: AmmoState | null;
}

export function normalizeWeaponMode(
  mode: WeaponMode,
  opts: { st?: number; rules?: Ruleset; currentShots?: number } = {},
): NormalizedWeapon {
  const rules = opts.rules ?? defaultRuleset;
  const shots = parseShots(mode.shots);
  const rof = parseRoF(mode.rof);
  const range = parseRange(mode.range);
  const damage = resolveDamageExpression(
    mode.damage,
    opts.st === undefined
      ? { progression: rules.damageProgression }
      : { st: opts.st, progression: rules.damageProgression },
  );
  return {
    name: mode.name,
    skill: text(mode.skill),
    damage,
    reach: parseReach(mode.reach),
    parry: parseParry(mode.parry),
    accuracy: parseSignedNumber(mode.accuracy),
    bulk: parseSignedNumber(mode.bulk),
    range,
    rof,
    shots,
    recoil: parseRecoil(mode.recoil, rules),
    ranged: range.status !== "unconfigured" || shots.status !== "unconfigured",
    ammo:
      shots.status === "resolved" && shots.value
        ? createAmmoState(shots.value, opts.currentShots)
        : null,
  };
}

/**
 * Configurable modifier hooks. They only surface values the weapon already
 * declares; no maneuver rules are invented here.
 */
export function accuracyModifier(
  weapon: NormalizedWeapon,
  opts: { aiming: boolean },
  rules: Ruleset = defaultRuleset,
): number | null {
  if (!rules.weapon.accuracyBonusEnabled) return null;
  if (!opts.aiming) return 0;
  return weapon.accuracy.status === "resolved" ? weapon.accuracy.value : null;
}

export function bulkModifier(
  weapon: NormalizedWeapon,
  rules: Ruleset = defaultRuleset,
): number | null {
  if (!rules.weapon.bulkPenaltyEnabled) return null;
  return weapon.bulk.status === "resolved" ? weapon.bulk.value : null;
}
