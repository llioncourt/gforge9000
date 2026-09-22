/**
 * Campaign Adaptation Studio: turn a campaign's canon into a scanned,
 * fact-checked, scene-broken-down source for a comic and/or movie pipeline.
 *
 * Mirrors `src/lib/adaptation/api.ts` (the browser client used by the Studio
 * UI) exactly — same table names, same dedupe/chunking/`onConflict` rules,
 * same `preserveManualEdits` and `manually_edited: true` behaviours — but
 * runs against the caller's RLS-scoped `ctx.supabase` instead of the browser
 * client, since the browser module cannot be imported here.
 *
 * Every adaptation table is GM-only by RLS already. On top of that this file
 * always loads the adaptation's campaign and requires the caller to be its
 * Game Master before ANY action — including reads — because the Studio is
 * GM-only by design and the MCP must never widen what the app allows.
 *
 * The adaptation tables were created after the generated Supabase types were
 * written (see the same comment in `api.ts`), so all access goes through
 * `anyDb(ctx.supabase)`.
 */

import { z } from "zod/v4";
import {
  actionRouter,
  anyDb,
  buildPatch,
  deleteReply,
  detailReply,
  domainOutput,
  fail,
  listReply,
  loadCampaign,
  requireGmFor,
  requirePatch,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, ToolRegistrar } from "@/lib/mcp/kit.server";
import {
  ADAPTATION_STATUSES,
  ASSET_ROLES,
  CANON_STATUSES,
  PROVENANCE_TYPES,
  RESOLUTION_STATUSES,
  SOURCE_MODES,
  SPOILER_POLICIES,
  WIZARD_STEPS,
} from "@/lib/adaptation/types";

/* ------------------------------------------------------------------ */
/* Shared enums (mirroring src/lib/adaptation/types.ts value sets)     */
/* ------------------------------------------------------------------ */

const adaptationStatus = z.enum(ADAPTATION_STATUSES);
const sourceMode = z.enum(SOURCE_MODES);
const spoilerPolicy = z.enum(SPOILER_POLICIES);
const wizardStep = z.enum(WIZARD_STEPS);
const provenanceType = z.enum(PROVENANCE_TYPES);
const canonStatus = z.enum(CANON_STATUSES);
const resolutionStatus = z.enum(RESOLUTION_STATUSES);
const assetRole = z.enum(ASSET_ROLES);

// Not part of the shared vocabulary file; mirrored from the CHECK constraints
// used directly in `src/lib/adaptation/api.ts`.
const changeSetStatus = z.enum(["open", "applied", "dismissed"]);
const assetSuggestedBy = z.enum(["explicit", "ai", "manual"]);
const targetSystem = z.enum(["rx_comics", "moviesmith"]);

const jsonValue = z.unknown();
const jsonArray = z.array(jsonValue);
const jsonObject = z.record(z.string(), z.unknown());

/* ------------------------------------------------------------------ */
/* Shared row-shaped fragments                                         */
/* ------------------------------------------------------------------ */

const factInput = z.object({
  stable_key: z.string().min(1).max(300),
  subject_entity_id: uuid.nullable().optional(),
  fact_type: z.string().min(1).max(100),
  statement: z.string().min(1).max(10000),
  provenance_type: provenanceType,
  source_refs: jsonArray.optional(),
  confidence: z.number().min(0).max(1),
  canon_status: canonStatus,
  conflict_with: z.array(z.string()).optional(),
  knowledge_scope: jsonObject.optional(),
  gm_only: z.boolean().optional(),
});

const sceneInput = z.object({
  stable_key: z.string().min(1).max(300),
  sequence_no: z.number().int().min(0).optional(),
  title: z.string().min(1).max(300).optional(),
  synopsis: z.string().max(20000).optional(),
  dramatic_goal: z.string().max(2000).optional(),
  story_beats: jsonArray.optional(),
  dialogue: jsonArray.optional(),
  narration: jsonArray.optional(),
  cast_entity_ids: z.array(z.string()).optional(),
  location_entity_id: uuid.nullable().optional(),
  prop_entity_ids: z.array(z.string()).optional(),
  wardrobe_refs: jsonArray.optional(),
  continuity_state: jsonObject.optional(),
  knowledge_state: jsonObject.optional(),
  source_refs: jsonArray.optional(),
  provenance_type: provenanceType.optional(),
  review_status: canonStatus.optional(),
  manually_edited: z.boolean().optional(),
  content_hash: z.string().max(200).optional(),
  gm_only: z.boolean().optional(),
});

const assetInput = z.object({
  source_kind: z.string().min(1).max(100),
  source_id: uuid.nullable().optional(),
  canonical_entity_id: uuid.nullable().optional(),
  role: assetRole,
  bucket: z.string().max(200).nullable().optional(),
  storage_path: z.string().max(1000).nullable().optional(),
  media_type: z.string().max(200).nullable().optional(),
  byte_size: z.number().int().min(0).nullable().optional(),
  sha256: z.string().max(200).nullable().optional(),
  bundle_path: z.string().max(1000).nullable().optional(),
  target_hints: jsonObject.optional(),
  is_canonical: z.boolean().optional(),
  resolution_status: resolutionStatus.optional(),
  suggested_by: assetSuggestedBy.optional(),
});

const snapshotInput = z.object({
  snapshot_hash: z.string().min(1).max(200),
  stats: z.record(z.string(), z.number()),
  sources: z.array(
    z.object({
      source_type: z.string().min(1).max(100),
      source_id: uuid.nullable().optional(),
      source_key: z.string().min(1).max(300),
      source_hash: z.string().min(1).max(200),
      label: z.string().max(500).optional(),
    }),
  ),
});

const changeSetSideInput = z.record(z.string(), z.unknown());

/* ------------------------------------------------------------------ */
/* Input schema                                                        */
/* ------------------------------------------------------------------ */

const input = z.discriminatedUnion("action", [
  // -------------------------------------------------------- projects
  z
    .object({ action: z.literal("list_projects"), campaign_id: uuid })
    .describe("List every adaptation project for a campaign. GM only."),
  z
    .object({ action: z.literal("get_project"), adaptation_id: uuid })
    .describe("Get one adaptation project by id. GM only."),
  z
    .object({
      action: z.literal("create_project"),
      campaign_id: uuid,
      name: z.string().min(1).max(300),
      source_mode: sourceMode.optional(),
      spoiler_policy: spoilerPolicy.optional(),
      target_comic: z.boolean().optional(),
      target_movie: z.boolean().optional(),
    })
    .describe("Create a new adaptation project for a campaign. GM only — changes data."),
  z
    .object({
      action: z.literal("update_project"),
      adaptation_id: uuid,
      name: z.string().min(1).max(300).optional(),
      status: adaptationStatus.optional(),
      source_mode: sourceMode.optional(),
      spoiler_policy: spoilerPolicy.optional(),
      target_comic: z.boolean().optional(),
      target_movie: z.boolean().optional(),
      source_scope: jsonObject.optional(),
      creative_settings: jsonObject.optional(),
      wizard_step: wizardStep.optional(),
      version: z.number().int().min(0).optional(),
    })
    .describe("Patch an adaptation project's fields. GM only — changes data."),
  z
    .object({ action: z.literal("delete_project"), adaptation_id: uuid })
    .describe("Permanently delete an adaptation project and its data. GM only — deletes data."),

  // --------------------------------------------------------- sources
  z
    .object({ action: z.literal("list_sources"), adaptation_id: uuid })
    .describe("List the scanned source list currently stored for an adaptation. GM only."),
  z
    .object({ action: z.literal("save_scan"), adaptation_id: uuid, snapshot: snapshotInput })
    .describe(
      "Replace the stored source list with a freshly scanned one and record a snapshot. " +
        "GM only — changes data.",
    ),
  z
    .object({ action: z.literal("list_snapshots"), adaptation_id: uuid })
    .describe("List every scan snapshot recorded for an adaptation, newest first. GM only."),

  // ----------------------------------------------------------- facts
  z
    .object({
      action: z.literal("list_facts"),
      adaptation_id: uuid,
      limit: z.number().int().min(1).max(2000).optional(),
    })
    .describe("List canon facts for an adaptation, ordered by provenance then creation. GM only."),
  z
    .object({
      action: z.literal("upsert_facts"),
      adaptation_id: uuid,
      facts: z.array(factInput).min(1),
    })
    .describe(
      "Upsert facts by stable_key (last row wins per key, chunked in batches of 400). " +
        "GM only — changes data.",
    ),
  z
    .object({ action: z.literal("review_fact"), fact_id: uuid, canon_status: canonStatus })
    .describe("Set a fact's canon_status and record the reviewer/time. GM only — changes data."),
  z
    .object({
      action: z.literal("edit_fact"),
      fact_id: uuid,
      statement: z.string().min(1).max(10000),
    })
    .describe("Edit a fact's statement text. GM only — changes data."),

  // ---------------------------------------------------------- scenes
  z
    .object({
      action: z.literal("list_scenes"),
      adaptation_id: uuid,
      limit: z.number().int().min(1).max(2000).optional(),
    })
    .describe("List scenes for an adaptation, ordered by sequence_no. GM only."),
  z
    .object({
      action: z.literal("upsert_scenes"),
      adaptation_id: uuid,
      scenes: z.array(sceneInput).min(1),
      preserve_manual_edits: z.boolean().optional(),
    })
    .describe(
      "Upsert scenes by stable_key (chunked in batches of 200). When preserve_manual_edits " +
        "is true (the default), incoming scenes whose stable_key already belongs to a " +
        "manually-edited scene are skipped. GM only — changes data.",
    ),
  z
    .object({
      action: z.literal("update_scene"),
      scene_id: uuid,
      sequence_no: z.number().int().min(0).optional(),
      title: z.string().min(1).max(300).optional(),
      synopsis: z.string().max(20000).optional(),
      dramatic_goal: z.string().max(2000).optional(),
      story_beats: jsonArray.optional(),
      dialogue: jsonArray.optional(),
      narration: jsonArray.optional(),
      cast_entity_ids: z.array(z.string()).optional(),
      location_entity_id: uuid.nullable().optional(),
      prop_entity_ids: z.array(z.string()).optional(),
      wardrobe_refs: jsonArray.optional(),
      continuity_state: jsonObject.optional(),
      knowledge_state: jsonObject.optional(),
      review_status: canonStatus.optional(),
      gm_only: z.boolean().optional(),
    })
    .describe(
      "Patch one scene's fields. Always sets manually_edited to true, matching the Studio's " +
        "own edit behaviour. GM only — changes data.",
    ),

  // ---------------------------------------------------------- assets
  z
    .object({ action: z.literal("list_assets"), adaptation_id: uuid })
    .describe("List asset links for an adaptation, ordered by role. GM only."),
  z
    .object({
      action: z.literal("replace_assets"),
      adaptation_id: uuid,
      assets: z.array(assetInput),
    })
    .describe(
      "Replace every asset link for an adaptation with the given list (chunked inserts of " +
        "400). An empty list clears all links. GM only — changes data.",
    ),
  z
    .object({
      action: z.literal("update_asset"),
      asset_link_id: uuid,
      canonical_entity_id: uuid.nullable().optional(),
      role: assetRole.optional(),
      bucket: z.string().max(200).nullable().optional(),
      storage_path: z.string().max(1000).nullable().optional(),
      media_type: z.string().max(200).nullable().optional(),
      byte_size: z.number().int().min(0).nullable().optional(),
      sha256: z.string().max(200).nullable().optional(),
      bundle_path: z.string().max(1000).nullable().optional(),
      target_hints: jsonObject.optional(),
      is_canonical: z.boolean().optional(),
      resolution_status: resolutionStatus.optional(),
      suggested_by: assetSuggestedBy.optional(),
    })
    .describe("Patch one asset link's fields. GM only — changes data."),

  // ----------------------------------------------------- change sets
  z
    .object({
      action: z.literal("save_change_set"),
      adaptation_id: uuid,
      from_snapshot_id: uuid.nullable().optional(),
      to_snapshot_id: uuid.nullable().optional(),
      added: changeSetSideInput,
      changed: changeSetSideInput,
      removed: changeSetSideInput,
      impact: changeSetSideInput,
    })
    .describe("Record a new change set between two snapshots. GM only — changes data."),
  z
    .object({ action: z.literal("list_change_sets"), adaptation_id: uuid })
    .describe("List change sets for an adaptation, newest first. GM only."),
  z
    .object({
      action: z.literal("set_change_set_status"),
      change_set_id: uuid,
      status: changeSetStatus,
    })
    .describe("Set a change set's status (open, applied, or dismissed). GM only — changes data."),

  // ---------------------------------------------------------- targets
  z
    .object({ action: z.literal("list_targets"), adaptation_id: uuid })
    .describe(
      "List the pipeline targets (rx_comics, moviesmith) linked to an adaptation. GM only.",
    ),
  z
    .object({
      action: z.literal("upsert_target"),
      adaptation_id: uuid,
      target_system: targetSystem,
      target_project_external_id: z.string().max(300).nullable().optional(),
      last_sync_hash: z.string().max(300).nullable().optional(),
      metadata: jsonObject.optional(),
    })
    .describe(
      "Upsert a pipeline target link for an adaptation (one row per target_system) and " +
        "stamp last_synced_at. GM only — changes data.",
    ),
]);

/* ------------------------------------------------------------------ */
/* Authorization helpers                                               */
/* ------------------------------------------------------------------ */

/** Loads an adaptation project row and requires the caller be its campaign's GM. */
async function requireGmForAdaptation(
  ctx: McpToolContext,
  adaptationId: string,
  action: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await anyDb(ctx.supabase)
    .from("adaptation_projects")
    .select("*")
    .eq("id", adaptationId)
    .maybeSingle();
  if (error) fail("Adaptation lookup", error);
  if (!data) throw new Error("Adaptation project not found, or you do not have access to it.");
  const campaign = await loadCampaign(ctx, data["campaign_id"] as string);
  requireGmFor(campaign, action);
  return data;
}

/** Loads a row from an adaptation child table and authorizes via its parent adaptation. */
async function loadOwnedRow(
  ctx: McpToolContext,
  table: string,
  idColumn: string,
  id: string,
  action: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await anyDb(ctx.supabase)
    .from(table)
    .select("*")
    .eq(idColumn, id)
    .maybeSingle();
  if (error) fail(`${table} lookup`, error);
  if (!data) throw new Error(`Row not found in ${table}, or you do not have access to it.`);
  await requireGmForAdaptation(ctx, data["adaptation_id"] as string, action);
  return data;
}

/** Keeps the last row for each key so one batch never upserts the same key twice. */
function dedupeByKey<T extends { stable_key?: string }>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(row.stable_key ?? "", row);
  return [...byKey.values()];
}

async function chunkedUpsert(
  ctx: McpToolContext,
  table: string,
  rows: Record<string, unknown>[],
  onConflict: string,
  chunkSize: number,
): Promise<void> {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await anyDb(ctx.supabase)
      .from(table)
      .upsert(rows.slice(index, index + chunkSize), { onConflict });
    if (error) fail(`Upserting ${table}`, error);
  }
}

async function chunkedInsert(
  ctx: McpToolContext,
  table: string,
  rows: Record<string, unknown>[],
  chunkSize: number,
): Promise<void> {
  for (let index = 0; index < rows.length; index += chunkSize) {
    const { error } = await anyDb(ctx.supabase)
      .from(table)
      .insert(rows.slice(index, index + chunkSize));
    if (error) fail(`Inserting into ${table}`, error);
  }
}

/* ------------------------------------------------------------------ */
/* Registration                                                        */
/* ------------------------------------------------------------------ */

export function registerAdaptation(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "adaptation",
    {
      title: "Campaign Adaptation Studio",
      description:
        "Manage the Campaign Adaptation Studio: turning a campaign's canon into a comic and/or " +
        "movie pipeline source. Every action requires the caller to be the Game Master of the " +
        "adaptation's campaign — the Studio is GM-only by design. " +
        "Projects: list_projects, get_project (read), create_project, update_project, " +
        "delete_project (changes/deletes data). " +
        "Sources: list_sources (read), save_scan (replaces the source list and records a " +
        "snapshot — changes data), list_snapshots (read). " +
        "Facts: list_facts (read), upsert_facts (changes data), review_fact (sets canon_status " +
        "— changes data), edit_fact (changes data). " +
        "Scenes: list_scenes (read), upsert_scenes (changes data), update_scene (always marks " +
        "the scene manually_edited — changes data). " +
        "Assets: list_assets (read), replace_assets (replaces all asset links — changes data), " +
        "update_asset (changes data). " +
        "Change sets: save_change_set (changes data), list_change_sets (read), " +
        "set_change_set_status (changes data). " +
        "Targets: list_targets (read), upsert_target (changes data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      // ================================================== projects
      list_projects: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "view its adaptation projects");
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_projects")
          .select("*")
          .eq("campaign_id", i.campaign_id)
          .order("created_at", { ascending: false });
        if (error) fail("Listing adaptation projects", error);
        const rows = data ?? [];
        return listReply("adaptation projects", rows, rows.length);
      },
      get_project: async (i) => {
        const project = await requireGmForAdaptation(ctx, i.adaptation_id, "view this adaptation");
        return detailReply(`Adaptation project "${project["name"] as string}".`, project);
      },
      create_project: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "create adaptation projects");
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_projects")
          .insert({
            campaign_id: i.campaign_id,
            name: i.name,
            source_mode: i.source_mode,
            spoiler_policy: i.spoiler_policy,
            target_comic: i.target_comic,
            target_movie: i.target_movie,
            created_by: ctx.userId,
          })
          .select("*")
          .single();
        if (error) fail("Creating adaptation project", error);
        return detailReply(`Created adaptation project "${data["name"] as string}".`, data);
      },
      update_project: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "update this adaptation");
        const patch = buildPatch({
          name: i.name,
          status: i.status,
          source_mode: i.source_mode,
          spoiler_policy: i.spoiler_policy,
          target_comic: i.target_comic,
          target_movie: i.target_movie,
          source_scope: i.source_scope,
          creative_settings: i.creative_settings,
          wizard_step: i.wizard_step,
          version: i.version,
        });
        requirePatch(patch);
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_projects")
          .update(patch)
          .eq("id", i.adaptation_id)
          .select("*")
          .single();
        if (error) fail("Updating adaptation project", error);
        return detailReply(`Updated adaptation project "${data["name"] as string}".`, data);
      },
      delete_project: async (i) => {
        const project = await requireGmForAdaptation(
          ctx,
          i.adaptation_id,
          "delete this adaptation",
        );
        const { error } = await anyDb(ctx.supabase)
          .from("adaptation_projects")
          .delete()
          .eq("id", i.adaptation_id);
        if (error) fail("Deleting adaptation project", error);
        return deleteReply(
          `Deleted adaptation project "${project["name"] as string}".`,
          i.adaptation_id,
        );
      },

      // =================================================== sources
      list_sources: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "view this adaptation's sources");
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_sources")
          .select("*")
          .eq("adaptation_id", i.adaptation_id);
        if (error) fail("Listing adaptation sources", error);
        const rows = data ?? [];
        return listReply("adaptation sources", rows, rows.length);
      },
      save_scan: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "save a scan for this adaptation");
        const { error: delError } = await anyDb(ctx.supabase)
          .from("adaptation_sources")
          .delete()
          .eq("adaptation_id", i.adaptation_id);
        if (delError) fail("Clearing previous scan", delError);
        const rows = i.snapshot.sources.map((source) => ({
          adaptation_id: i.adaptation_id,
          source_type: source.source_type,
          source_id: source.source_id ?? null,
          source_key: source.source_key,
          source_hash: source.source_hash,
          included: true,
          metadata: { label: source.label ?? "" },
        }));
        await chunkedInsert(ctx, "adaptation_sources", rows, 500);
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_snapshots")
          .insert({
            adaptation_id: i.adaptation_id,
            snapshot_hash: i.snapshot.snapshot_hash,
            source_hashes: Object.fromEntries(
              i.snapshot.sources.map((source) => [source.source_key, source.source_hash]),
            ),
            stats: i.snapshot.stats,
          })
          .select("*")
          .single();
        if (error) fail("Recording scan snapshot", error);
        return detailReply(
          `Saved scan with ${rows.length} sources and recorded snapshot "${data["snapshot_hash"] as string}".`,
          data,
        );
      },
      list_snapshots: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "view this adaptation's snapshots");
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_snapshots")
          .select("*")
          .eq("adaptation_id", i.adaptation_id)
          .order("created_at", { ascending: false });
        if (error) fail("Listing snapshots", error);
        const rows = data ?? [];
        return listReply("scan snapshots", rows, rows.length);
      },

      // ===================================================== facts
      list_facts: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "view this adaptation's facts");
        let query = anyDb(ctx.supabase)
          .from("adaptation_facts")
          .select("*")
          .eq("adaptation_id", i.adaptation_id)
          .order("provenance_type", { ascending: true })
          .order("created_at", { ascending: true });
        if (i.limit) query = query.limit(i.limit);
        const { data, error } = await query;
        if (error) fail("Listing facts", error);
        const { count, error: countError } = await anyDb(ctx.supabase)
          .from("adaptation_facts")
          .select("id", { count: "exact", head: true })
          .eq("adaptation_id", i.adaptation_id);
        if (countError) fail("Counting facts", countError);
        const rows = data ?? [];
        return listReply("facts", rows, typeof count === "number" ? count : rows.length);
      },
      upsert_facts: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "upsert facts for this adaptation");
        const rows = dedupeByKey(
          i.facts.map((factRow) => ({
            ...factRow,
            adaptation_id: i.adaptation_id,
          })),
        );
        await chunkedUpsert(ctx, "adaptation_facts", rows, "adaptation_id,stable_key", 400);
        return detailReply(`Upserted ${rows.length} facts.`, {
          adaptation_id: i.adaptation_id,
          count: rows.length,
        });
      },
      review_fact: async (i) => {
        const existing = await loadOwnedRow(
          ctx,
          "adaptation_facts",
          "id",
          i.fact_id,
          "review facts",
        );
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_facts")
          .update({
            canon_status: i.canon_status,
            reviewed_by: ctx.userId,
            reviewed_at: new Date().toISOString(),
          })
          .eq("id", i.fact_id)
          .select("*")
          .single();
        if (error) fail("Reviewing fact", error);
        void existing;
        return detailReply(`Set fact review status to "${i.canon_status}".`, data);
      },
      edit_fact: async (i) => {
        await loadOwnedRow(ctx, "adaptation_facts", "id", i.fact_id, "edit facts");
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_facts")
          .update({ statement: i.statement })
          .eq("id", i.fact_id)
          .select("*")
          .single();
        if (error) fail("Editing fact", error);
        return detailReply("Updated fact statement.", data);
      },

      // ==================================================== scenes
      list_scenes: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "view this adaptation's scenes");
        let query = anyDb(ctx.supabase)
          .from("adaptation_scenes")
          .select("*")
          .eq("adaptation_id", i.adaptation_id)
          .order("sequence_no", { ascending: true });
        if (i.limit) query = query.limit(i.limit);
        const { data, error } = await query;
        if (error) fail("Listing scenes", error);
        const { count, error: countError } = await anyDb(ctx.supabase)
          .from("adaptation_scenes")
          .select("id", { count: "exact", head: true })
          .eq("adaptation_id", i.adaptation_id);
        if (countError) fail("Counting scenes", countError);
        const rows = data ?? [];
        return listReply("scenes", rows, typeof count === "number" ? count : rows.length);
      },
      upsert_scenes: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "upsert scenes for this adaptation");
        const preserveManualEdits = i.preserve_manual_edits ?? true;
        let incoming = i.scenes;
        if (preserveManualEdits) {
          const { data: existingScenes, error } = await anyDb(ctx.supabase)
            .from("adaptation_scenes")
            .select("stable_key, manually_edited")
            .eq("adaptation_id", i.adaptation_id);
          if (error) fail("Loading existing scenes", error);
          const locked = new Set(
            (existingScenes ?? [])
              .filter((scene: { manually_edited: boolean }) => scene.manually_edited)
              .map((scene: { stable_key: string }) => scene.stable_key),
          );
          incoming = i.scenes.filter((scene) => !locked.has(scene.stable_key));
        }
        const rows = dedupeByKey(
          incoming.map((scene) => ({ ...scene, adaptation_id: i.adaptation_id })),
        );
        await chunkedUpsert(ctx, "adaptation_scenes", rows, "adaptation_id,stable_key", 200);
        return detailReply(`Upserted ${rows.length} scenes.`, {
          adaptation_id: i.adaptation_id,
          count: rows.length,
          skipped_manually_edited: i.scenes.length - incoming.length,
        });
      },
      update_scene: async (i) => {
        await loadOwnedRow(ctx, "adaptation_scenes", "id", i.scene_id, "edit scenes");
        const { scene_id, action, ...rest } = i;
        void action;
        const patch = buildPatch(rest);
        requirePatch(patch);
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_scenes")
          .update({ ...patch, manually_edited: true })
          .eq("id", scene_id)
          .select("*")
          .single();
        if (error) fail("Updating scene", error);
        return detailReply(`Updated scene "${data["title"] as string}" (manually edited).`, data);
      },

      // ==================================================== assets
      list_assets: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "view this adaptation's assets");
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_asset_links")
          .select("*")
          .eq("adaptation_id", i.adaptation_id)
          .order("role", { ascending: true });
        if (error) fail("Listing assets", error);
        const rows = data ?? [];
        return listReply("asset links", rows, rows.length);
      },
      replace_assets: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "replace this adaptation's assets");
        const { error: delError } = await anyDb(ctx.supabase)
          .from("adaptation_asset_links")
          .delete()
          .eq("adaptation_id", i.adaptation_id);
        if (delError) fail("Clearing previous assets", delError);
        const rows = i.assets.map((assetRow) => ({ ...assetRow, adaptation_id: i.adaptation_id }));
        await chunkedInsert(ctx, "adaptation_asset_links", rows, 400);
        return detailReply(`Replaced asset links with ${rows.length} entries.`, {
          adaptation_id: i.adaptation_id,
          count: rows.length,
        });
      },
      update_asset: async (i) => {
        await loadOwnedRow(ctx, "adaptation_asset_links", "id", i.asset_link_id, "edit assets");
        const { asset_link_id, action, ...rest } = i;
        void action;
        const patch = buildPatch(rest);
        requirePatch(patch);
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_asset_links")
          .update(patch)
          .eq("id", asset_link_id)
          .select("*")
          .single();
        if (error) fail("Updating asset link", error);
        return detailReply("Updated asset link.", data);
      },

      // ============================================== change sets
      save_change_set: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "save a change set for this adaptation");
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_change_sets")
          .insert({
            adaptation_id: i.adaptation_id,
            from_snapshot_id: i.from_snapshot_id ?? null,
            to_snapshot_id: i.to_snapshot_id ?? null,
            added: i.added,
            changed: i.changed,
            removed: i.removed,
            impact: i.impact,
          })
          .select("*")
          .single();
        if (error) fail("Saving change set", error);
        return detailReply("Recorded change set.", data);
      },
      list_change_sets: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "view this adaptation's change sets");
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_change_sets")
          .select("*")
          .eq("adaptation_id", i.adaptation_id)
          .order("created_at", { ascending: false });
        if (error) fail("Listing change sets", error);
        const rows = data ?? [];
        return listReply("change sets", rows, rows.length);
      },
      set_change_set_status: async (i) => {
        await loadOwnedRow(
          ctx,
          "adaptation_change_sets",
          "id",
          i.change_set_id,
          "change a change set's status",
        );
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_change_sets")
          .update({ status: i.status })
          .eq("id", i.change_set_id)
          .select("*")
          .single();
        if (error) fail("Setting change set status", error);
        return detailReply(`Set change set status to "${i.status}".`, data);
      },

      // ==================================================== targets
      list_targets: async (i) => {
        await requireGmForAdaptation(ctx, i.adaptation_id, "view this adaptation's targets");
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_targets")
          .select("*")
          .eq("adaptation_id", i.adaptation_id);
        if (error) fail("Listing targets", error);
        const rows = data ?? [];
        return listReply("adaptation targets", rows, rows.length);
      },
      upsert_target: async (i) => {
        await requireGmForAdaptation(
          ctx,
          i.adaptation_id,
          "link a pipeline target to this adaptation",
        );
        const { data, error } = await anyDb(ctx.supabase)
          .from("adaptation_targets")
          .upsert(
            {
              adaptation_id: i.adaptation_id,
              target_system: i.target_system,
              target_project_external_id: i.target_project_external_id,
              last_sync_hash: i.last_sync_hash,
              metadata: i.metadata,
              last_synced_at: new Date().toISOString(),
            },
            { onConflict: "adaptation_id,target_system" },
          )
          .select("*")
          .single();
        if (error) fail("Upserting target", error);
        return detailReply(`Linked target "${i.target_system}".`, data);
      },
    }),
  );
}
