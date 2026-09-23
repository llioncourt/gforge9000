/**
 * Cross-cutting helpers shared by the campaigns, entries, relationships,
 * characters and character-entries tool modules. Extracted from the former
 * monolithic tools.server.ts so those modules stay independently readable.
 */

import { z } from "zod/v4";
import type { Database } from "@/integrations/supabase/types";
import { KINDS } from "@/lib/entity-kinds";
import { CAMPAIGN_SETTING_RANGES, HOUSE_RULES_MAX_LENGTH } from "@/lib/campaign-settings";
import {
  fail,
  intField,
  loadCampaign,
  quarterStep,
  safeRpc,
  stripGmFields,
  uuid,
  type CampaignAccess,
  type McpToolContext,
  type Structured,
} from "@/lib/mcp/kit.server";

/* ---------------- campaign settings ---------------- */

/**
 * The first-level campaign settings the app itself edits, each exposed as its
 * own parameter. Omitted keeps the current value, a value replaces the whole
 * setting, and `null` removes the key so the app falls back to its default.
 *
 * Numeric ranges come from the canonical `campaign-settings` module shared
 * with the UCF-CAMPAIGN-PACKAGE v1 schema, so the two cannot drift apart.
 */
export const campaignSettingFields = {
  point_limit: intField(
    CAMPAIGN_SETTING_RANGES.point_limit.min,
    CAMPAIGN_SETTING_RANGES.point_limit.max,
    "point_limit",
  )
    .nullable()
    .optional(),
  disadvantage_limit: intField(
    CAMPAIGN_SETTING_RANGES.disadvantage_limit.min,
    CAMPAIGN_SETTING_RANGES.disadvantage_limit.max,
    "disadvantage_limit",
  )
    .nullable()
    .optional(),
  /** May be zero or negative, mirroring disadvantage_limit. */
  quirk_limit: intField(
    CAMPAIGN_SETTING_RANGES.quirk_limit.min,
    CAMPAIGN_SETTING_RANGES.quirk_limit.max,
    "quirk_limit",
  )
    .nullable()
    .optional(),
  tech_level: intField(
    CAMPAIGN_SETTING_RANGES.tech_level.min,
    CAMPAIGN_SETTING_RANGES.tech_level.max,
    "tech_level",
  )
    .nullable()
    .optional(),
  house_rules: z.string().max(HOUSE_RULES_MAX_LENGTH).nullable().optional(),
  allowed_packs: z.array(z.string().max(120)).max(500).nullable().optional(),
  cover_path: z.string().max(400).nullable().optional(),
  ruleset_overrides: z.record(z.string(), z.unknown()).nullable().optional(),
} as const;

const CAMPAIGN_SETTING_KEYS = Object.keys(
  campaignSettingFields,
) as (keyof typeof campaignSettingFields)[];

/**
 * Builds the first-level settings patch sent to the atomic database helper:
 * only keys the caller actually supplied, with explicit `null` preserved as a
 * removal instruction. Nested values are passed through untouched.
 */
export function campaignSettingsPatch(input: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of CAMPAIGN_SETTING_KEYS) {
    if (key in input && input[key] !== undefined) patch[key] = input[key] ?? null;
  }
  return patch;
}

export const SETTINGS_DOC =
  "Each campaign setting is an independent parameter: leave one out to keep its current value (or its normal default on a new campaign), send a value to replace that whole setting, or send null to remove it so the app falls back to its default. Objects and arrays are replaced wholesale, never merged.";

/* ---------------- GM-only fields ---------------- */

/**
 * GM-only columns that must never reach a non-GM caller.
 * `summary` and `player_description` are the player-visible texts; the full
 * `description` is GM canon, like `gm_notes`.
 */
export const GM_ONLY_ENTITY_FIELDS = ["description", "gm_notes"] as const;
export const GM_ONLY_RELATIONSHIP_FIELDS = ["gm_description"] as const;

/** Exported for tests: the fields that must never reach a non-GM caller. */
export const MCP_GM_ONLY_FIELDS = {
  entity: GM_ONLY_ENTITY_FIELDS,
  relationship: GM_ONLY_RELATIONSHIP_FIELDS,
} as const;

export { stripGmFields as __stripGmFields };

/* ---------------- entries ---------------- */

export type EntityRow = Database["public"]["Tables"]["entities"]["Row"];
export type RelationshipRow = Database["public"]["Tables"]["entity_relationships"]["Row"];

const ENTITY_SUMMARY_FIELDS = [
  "id",
  "campaign_id",
  "kind",
  "name",
  "status",
  "visibility",
  "summary",
  "tags",
  "parent_id",
  "updated_at",
] as const;

export function entitySummary(row: EntityRow): Structured {
  const out: Structured = {};
  for (const field of ENTITY_SUMMARY_FIELDS) out[field] = row[field];
  return out;
}

export async function loadEntity(
  ctx: McpToolContext,
  entryId: string,
): Promise<{ row: EntityRow; campaign: CampaignAccess }> {
  const { data, error } = await safeRpc(ctx.supabase)("list_entities_safe")
    .eq("id", entryId)
    .maybeSingle();
  if (error) fail("Entry lookup", error);
  if (!data) throw new Error("Entry not found, or you do not have access to it.");
  const row = data as EntityRow;
  const campaign = await loadCampaign(ctx, row.campaign_id);
  return { row, campaign };
}

/** Longest parent chain we are willing to walk before refusing the move. */
export const MAX_PARENT_DEPTH = 64;

export function kindDef(kind: string) {
  const found = KINDS.find((entry) => entry.kind === kind);
  if (!found) {
    throw new Error(
      `Unknown entry kind "${kind}". Use list_entry_types to see the kinds this app accepts.`,
    );
  }
  return found;
}

/**
 * Matches a status against the kind's own catalogue, ignoring case, and gives
 * back the exact spelling the app uses for that kind.
 */
export function canonicalStatus(kind: string, status: string): string {
  const def = kindDef(kind);
  const match = def.statuses.find((value) => value.toLowerCase() === status.toLowerCase());
  if (!match) {
    throw new Error(
      `Status "${status}" is not valid for ${kind}. Valid statuses: ${def.statuses.join(", ")}.`,
    );
  }
  return match;
}

/**
 * Rejects a parent that would create a loop. Walks the proposed parent's own
 * ancestors with bounded plain queries — no recursive SQL, no schema changes.
 */
export async function assertParentIsSafe(
  ctx: McpToolContext,
  entryId: string,
  parentId: string,
  campaignId: string,
): Promise<void> {
  if (parentId === entryId) throw new Error("An entry cannot be its own parent.");
  const seen = new Set<string>([entryId]);
  let cursor: string | null = parentId;
  for (let depth = 0; depth < MAX_PARENT_DEPTH && cursor; depth += 1) {
    const currentId: string = cursor;
    const { data, error } = await ctx.supabase
      .from("entities")
      .select("id, campaign_id, parent_id")
      .eq("id", currentId)
      .maybeSingle();

    if (error) fail("Parent lookup", error);
    if (!data) throw new Error("Parent entry not found, or you do not have access to it.");
    if (data.campaign_id !== campaignId) {
      throw new Error("The parent entry must belong to the same campaign.");
    }
    if (seen.has(data.id) && data.id !== parentId) {
      throw new Error("That parent would create a loop in the entry hierarchy.");
    }
    if (data.parent_id === entryId) {
      throw new Error("That parent would create a loop in the entry hierarchy.");
    }
    if (data.parent_id && seen.has(data.parent_id)) {
      throw new Error("That parent would create a loop in the entry hierarchy.");
    }
    seen.add(data.id);
    cursor = data.parent_id;
  }
  if (cursor) throw new Error("The entry hierarchy is too deep to verify this move safely.");
}

/* ---------------- relationships ---------------- */

export async function loadRelationship(
  ctx: McpToolContext,
  relationshipId: string,
): Promise<{ row: RelationshipRow; campaign: CampaignAccess }> {
  const { data, error } = await ctx.supabase
    .from("entity_relationships")
    .select("*")
    .eq("id", relationshipId)
    .maybeSingle();
  if (error) fail("Relationship lookup", error);
  if (!data) throw new Error("Link not found, or you do not have access to it.");
  const campaign = await loadCampaign(ctx, data.campaign_id);
  return { row: data, campaign };
}

export const strengthField = intField(-5, 5, "strength");

/* ---------------- characters ---------------- */

/** Every character column an assistant may write, shared by create and update. */
export const characterWritableFields = {
  concept: z.string().max(400).nullable().optional(),
  player_name: z.string().max(120).nullable().optional(),
  campaign_id: uuid.nullable().optional(),
  is_npc: z.boolean().optional(),
  point_budget: intField(0, 100000, "point_budget").optional(),
  tech_level: intField(0, 20, "tech_level").optional(),
  st: intField(0, 1000, "st").optional(),
  dx: intField(0, 1000, "dx").optional(),
  iq: intField(0, 1000, "iq").optional(),
  ht: intField(0, 1000, "ht").optional(),
  hp_delta: intField(-1000, 1000, "hp_delta").optional(),
  will_delta: intField(-1000, 1000, "will_delta").optional(),
  per_delta: intField(-1000, 1000, "per_delta").optional(),
  fp_delta: intField(-1000, 1000, "fp_delta").optional(),
  speed_delta: quarterStep.optional(),
  move_delta: intField(-1000, 1000, "move_delta").optional(),
  current_hp: intField(-10000, 10000, "current_hp").nullable().optional(),
  current_fp: intField(-10000, 10000, "current_fp").nullable().optional(),
  conditions: z.array(z.string().max(80)).max(100).optional(),
  wealth: z.string().max(60).optional(),
  status: intField(-20, 20, "status").optional(),
  appearance: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(20000).nullable().optional(),
  gm_notes: z.string().max(20000).nullable().optional(),
} as const;

/* ---------------- character entries ---------------- */

/** Compact mode shortens long entry notes in the reply only — never in the DB. */
const COMPACT_NOTES_LIMIT = 200;

export function compactEntryNotes<T extends { notes?: string | null }>(row: T): T {
  const notes = row.notes;
  if (typeof notes !== "string" || notes.length <= COMPACT_NOTES_LIMIT) return row;
  return { ...row, notes: `${notes.slice(0, COMPACT_NOTES_LIMIT - 1).trimEnd()}…` };
}
