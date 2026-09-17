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
  "validation",
  "generate",
] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

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
