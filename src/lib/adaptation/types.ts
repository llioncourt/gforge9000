/**
 * Shared vocabulary for the Campaign Adaptation Studio.
 *
 * These literals mirror the CHECK constraints on the adaptation tables; the
 * database and the client must never disagree about them.
 */

export const PROVENANCE_TYPES = [
  "campaign_canon",
  "session_derived",
  "ai_inference",
  "adaptation_created",
  "conflict",
] as const;
export type ProvenanceType = (typeof PROVENANCE_TYPES)[number];

export const CANON_STATUSES = ["confirmed", "needs_review", "rejected"] as const;
export type CanonStatus = (typeof CANON_STATUSES)[number];

export const SOURCE_MODES = ["planned", "played", "mixed"] as const;
export type SourceMode = (typeof SOURCE_MODES)[number];

export const SPOILER_POLICIES = ["revealed_only", "include_gm_truth", "custom"] as const;
export type SpoilerPolicy = (typeof SPOILER_POLICIES)[number];

export const ASSET_ROLES = [
  "character",
  "location",
  "prop",
  "wardrobe",
  "map",
  "reference",
  "audio",
  "video",
] as const;
export type AssetRole = (typeof ASSET_ROLES)[number];

export const RESOLUTION_STATUSES = ["resolved", "unresolved", "ambiguous", "rejected"] as const;
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

/** Who knows a given fact. `unknown` means the campaign holds no evidence either way. */
export const KNOWLEDGE_LEVELS = [
  "world_truth",
  "gm_knowledge",
  "player_knowledge",
  "character_knowledge",
  "revealed",
  "unrevealed",
  "unknown",
] as const;
export type KnowledgeLevel = (typeof KNOWLEDGE_LEVELS)[number];

export const WIZARD_STEPS = [
  "source",
  "scope",
  "scan",
  "reconstruction",
  "timeline",
  "canon",
  "assets",
  "narrative",
  "comic",
  "movie",
  "book_narrative",
  "adventure_module",
  "validation",
  "generate",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** The four output formats. All share one reconstruction; each adds a projection. */
export const ADAPTATION_TARGETS = ["comic", "movie", "book_narrative", "adventure_module"] as const;
export type AdaptationTarget = (typeof ADAPTATION_TARGETS)[number];

/** Project column that stores whether a target is selected. */
export const TARGET_COLUMN = {
  comic: "target_comic",
  movie: "target_movie",
  book_narrative: "target_book_narrative",
  adventure_module: "target_adventure_module",
} as const satisfies Record<AdaptationTarget, string>;

export type TargetFlags = {
  target_comic?: boolean | null;
  target_movie?: boolean | null;
  target_book_narrative?: boolean | null;
  target_adventure_module?: boolean | null;
};

/** Selected targets in canonical order. Missing columns (older rows) read as not selected. */
export function selectedTargets(project: TargetFlags): AdaptationTarget[] {
  return ADAPTATION_TARGETS.filter((target) => project[TARGET_COLUMN[target]] === true);
}

/** Wizard steps the user actually walks through: target steps only for selected targets. */
export function activeWizardSteps(project: TargetFlags): WizardStep[] {
  const selected = new Set<string>(selectedTargets(project));
  return WIZARD_STEPS.filter(
    (step) => !(ADAPTATION_TARGETS as readonly string[]).includes(step) || selected.has(step),
  );
}

/**
 * Maps a stored step onto the active list. A step that is no longer active
 * (its target was deselected) lands on the next active step after it, so the
 * user keeps their place instead of being thrown back to the start.
 */
export function resolveWizardStep(stored: string | null | undefined, project: TargetFlags): WizardStep {
  const active = activeWizardSteps(project);
  const position = WIZARD_STEPS.indexOf(stored as WizardStep);
  if (position < 0) return active[0]!;
  if (active.includes(stored as WizardStep)) return stored as WizardStep;
  return active.find((step) => WIZARD_STEPS.indexOf(step) > position) ?? active[active.length - 1]!;
}

export const ADAPTATION_STATUSES = [
  "draft",
  "scanning",
  "reconstructing",
  "reviewing",
  "ready",
  "generated",
  "archived",
] as const;
export type AdaptationStatus = (typeof ADAPTATION_STATUSES)[number];

export const CHRONICLE_ITEM_TYPES = [
  "actual_event",
  "character_action",
  "discovery",
  "dialogue_highlight",
  "consequence",
  "canon_change",
  "ai_reconstruction",
] as const;
export type ChronicleItemType = (typeof CHRONICLE_ITEM_TYPES)[number];

/** A pointer back to the exact campaign record a fact or scene came from. */
export interface SourceRef {
  source_type: string;
  source_key: string;
  source_id?: string | null;
  label?: string | null;
  excerpt?: string | null;
}
