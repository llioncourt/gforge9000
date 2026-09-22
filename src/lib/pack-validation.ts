/**
 * Character validation report (pure).
 *
 * Combines the canonical engine (`buildSheet`, `skillLevel`, `checkLimits`)
 * with the derived pack-link state. Two rules matter here:
 *
 *  - Pack state is ALWAYS relative to the canonical pack definition. A
 *    campaign house rule (`ruleset_overrides`) can change effective costs and
 *    levels, but it can never turn an official linked entry into a modified
 *    one. House-rule effects are reported separately.
 *  - `character_entries.levels` is never treated as a skill level. Effective
 *    skill levels come from `skillLevel()` via `buildSheet()`; a `data.level`
 *    that disagrees with it is reported as its own finding.
 */

import { buildSheet, type CharacterEntry, type CharacterRecord } from "@/rules";
import { changedPaths } from "@/rules/campaign-ruleset";
import { defaultRuleset, type Ruleset } from "@/rules/ruleset";
import {
  countStates,
  leveledPricing,
  type PackLinkStatus,
  type PackItemLike,
} from "@/lib/pack-link";

export type ValidationFindingType =
  | "point_budget"
  | "campaign_point_limit"
  | "disadvantage_limit"
  | "quirk_limit"
  | "tech_level"
  | "stale_link"
  | "modified_link"
  | "stated_level_mismatch"
  | "leveled_pricing";

export interface ValidationFinding {
  type: ValidationFindingType;
  message: string;
  entry_id?: string;
  entry_name?: string;
  value?: number;
  allowed?: number;
  expected?: number;
  actual?: number;
}

export interface ValidatedEntry {
  id: string;
  name: string;
  kind: string;
  state: PackLinkStatus["state"];
  stale_reason?: string | undefined;
  diff?: PackLinkStatus["diff"];
  pack_name?: string | undefined;
}

export interface ValidatedSkill {
  id: string;
  name: string;
  /** Effective level from the engine — never `levels`. */
  effective_level: number | null;
  relative_level: number | null;
  points: number;
  stated_level: number | null;
  stated_level_matches: boolean | null;
}

export interface CharacterValidation {
  character_id: string;
  name: string;
  points: {
    total: number;
    point_budget: number;
    remaining: number;
    over_budget: boolean;
    disadvantages: number;
    quirks: number;
  };
  campaign_limits: {
    point_limit: number | null;
    disadvantage_limit: number | null;
    quirk_limit: number | null;
    tech_level: number | null;
  };
  house_rules: {
    /** True when the campaign overrides any engine number. */
    active: boolean;
    changed_paths: string[];
    note: string;
  };
  pack_states: ReturnType<typeof countStates>;
  entries: {
    official: ValidatedEntry[];
    modified: ValidatedEntry[];
    custom: ValidatedEntry[];
    stale: ValidatedEntry[];
  };
  skills: ValidatedSkill[];
  findings: ValidationFinding[];
}

export interface ValidationInput {
  character: CharacterRecord;
  entries: CharacterEntry[];
  statuses: Map<string, PackLinkStatus>;
  /** Pack definition of each linked entry, keyed by entry id, when resolved. */
  packItems?: Map<string, PackItemLike>;
  ruleset?: Ruleset;
}

function statedLevelOf(entry: CharacterEntry): number | null {
  const raw = (entry.data ?? {})["level"];
  if (raw === undefined || raw === null || !Number.isFinite(Number(raw))) return null;
  return Number(raw);
}

export function validateCharacter(input: ValidationInput): CharacterValidation {
  const rules = input.ruleset ?? defaultRuleset;
  const sheet = buildSheet(input.character, input.entries, rules);
  const findings: ValidationFinding[] = [];

  const buckets: CharacterValidation["entries"] = {
    official: [],
    modified: [],
    custom: [],
    stale: [],
  };

  for (const entry of input.entries) {
    const status = input.statuses.get(entry.id) ?? { state: "custom" as const, link: null };
    const view: ValidatedEntry = {
      id: entry.id,
      name: entry.name,
      kind: entry.kind,
      state: status.state,
      stale_reason: status.stale_reason,
      pack_name: status.link?.pack_name,
    };
    if (status.diff && status.diff.length) view.diff = status.diff;
    buckets[status.state].push(view);

    if (status.state === "stale") {
      findings.push({
        type: "stale_link",
        entry_id: entry.id,
        entry_name: entry.name,
        message: `"${entry.name}" is out of date with its content pack (${status.stale_reason}).`,
      });
    }
    if (status.state === "modified") {
      findings.push({
        type: "modified_link",
        entry_id: entry.id,
        entry_name: entry.name,
        message: `"${entry.name}" differs from its content-pack definition.`,
      });
    }

    const item = input.packItems?.get(entry.id);
    if (item) {
      const pricing = leveledPricing(entry, item);
      if (pricing && !pricing.consistent) {
        findings.push({
          type: "leveled_pricing",
          entry_id: entry.id,
          entry_name: entry.name,
          expected: pricing.expected,
          actual: pricing.actual,
          message: `"${entry.name}" costs ${pricing.actual} points but ${pricing.expected} is expected for ${entry.levels} level(s).`,
        });
      }
    }
  }

  const skills: ValidatedSkill[] = sheet.skills.map(({ entry, level }) => {
    const stated = statedLevelOf(entry);
    const matches = stated === null || level.effective === null ? null : stated === level.effective;
    if (matches === false) {
      findings.push({
        type: "stated_level_mismatch",
        entry_id: entry.id,
        entry_name: entry.name,
        ...(level.effective === null ? {} : { expected: level.effective }),
        ...(stated === null ? {} : { actual: stated }),
        message: `"${entry.name}" states level ${stated} but the sheet calculates ${level.effective}.`,
      });
    }
    return {
      id: entry.id,
      name: entry.name,
      effective_level: level.effective,
      relative_level: level.relative,
      points: Number((entry.data ?? {})["points"] ?? entry.points ?? 0),
      stated_level: stated,
      stated_level_matches: matches,
    };
  });

  const points = sheet.points;
  if (points.total > input.character.point_budget) {
    findings.push({
      type: "point_budget",
      value: points.total,
      allowed: input.character.point_budget,
      message: `Point total ${points.total} exceeds this sheet's budget of ${input.character.point_budget}.`,
    });
  }
  for (const violation of sheet.limits) {
    const type: ValidationFindingType =
      violation.limit === "pointBudget"
        ? "campaign_point_limit"
        : violation.limit === "disadvantageLimit"
          ? "disadvantage_limit"
          : violation.limit === "quirkLimit"
            ? "quirk_limit"
            : "tech_level";
    findings.push({
      type,
      value: violation.value,
      allowed: violation.allowed,
      message: violation.message,
    });
  }

  const changed = changedPaths(rules);
  return {
    character_id: input.character.id,
    name: input.character.name,
    points: {
      total: points.total,
      point_budget: input.character.point_budget,
      remaining: points.remaining,
      over_budget: points.total > input.character.point_budget,
      disadvantages: points.disadvantages,
      quirks: points.quirks,
    },
    campaign_limits: {
      point_limit: rules.limits.pointBudget,
      disadvantage_limit: rules.limits.disadvantageLimit,
      quirk_limit: rules.limits.quirkLimit,
      tech_level: rules.limits.techLevel,
    },
    house_rules: {
      active: changed.length > 0,
      changed_paths: changed,
      note:
        "Campaign house rules change calculated costs and levels only. They never affect " +
        "whether an entry counts as official, modified, custom or stale — pack state is always " +
        "measured against the canonical pack definition.",
    },
    pack_states: countStates(
      input.entries.map((entry) => input.statuses.get(entry.id) ?? { state: "custom" as const }),
    ),
    entries: buckets,
    skills,
    findings,
  };
}
