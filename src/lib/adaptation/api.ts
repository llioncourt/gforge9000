import { supabase } from "@/integrations/supabase/client";
import type {
  AdaptationStatus,
  AssetRole,
  CanonStatus,
  ProvenanceType,
  ResolutionStatus,
  SourceMode,
  SpoilerPolicy,
  WizardStep,
} from "@/lib/adaptation/types";
import type { ChangeSet, ScannedSource } from "@/lib/adaptation/diff";
import type { ScanSnapshot } from "@/lib/adaptation/scanner";
import type { ComicConfig, MovieConfig } from "@/lib/adaptation/projections";

/** Data access for the Campaign Adaptation Studio. Every table is GM-only by RLS. */

// The adaptation tables were created after the generated types were written.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

/**
 * Long runs (scan + reconstruction) can outlive the current access token.
 * Refresh it before writing so the request is not sent as an anonymous caller,
 * which the row policies reject.
 */
async function ensureSession(): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Your session expired. Sign in again to save this work.");
  const expiresAt = (data.session.expires_at ?? 0) * 1000;
  // Saving a long run can take minutes, so refresh well ahead of expiry.
  if (expiresAt && expiresAt - Date.now() < 300_000) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error || !refreshed.session) {
      throw new Error("Your session expired. Sign in again to save this work.");
    }
  }
}

/** Turns a rejected write into something the person reading it can act on. */
function writeError(message: string): Error {
  if (/row-level security|permission denied/i.test(message)) {
    return new Error(
      "This adaptation can only be saved by the campaign's Game Master. Sign in again or ask the GM to run this step.",
    );
  }
  return new Error(message);
}

/** Keeps the last row for each key so one batch never upserts the same key twice. */
function dedupeByKey<T extends { stable_key?: string }>(rows: T[]): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) byKey.set(row.stable_key ?? "", row);
  return [...byKey.values()];
}

export interface CreativeSettings {
  comic?: Partial<ComicConfig>;
  movie?: Partial<MovieConfig>;
  narrative?: {
    tone?: string;
    pov?: string;
    audience?: string;
    max_scenes?: number;
  };
}

export interface AdaptationProject {
  id: string;
  campaign_id: string;
  created_by: string;
  name: string;
  status: AdaptationStatus;
  source_mode: SourceMode;
  spoiler_policy: SpoilerPolicy;
  target_comic: boolean;
  target_movie: boolean;
  source_scope: Record<string, unknown>;
  creative_settings: CreativeSettings;
  wizard_step: WizardStep;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface AdaptationFactRow {
  id: string;
  adaptation_id: string;
  stable_key: string;
  subject_entity_id: string | null;
  fact_type: string;
  statement: string;
  provenance_type: ProvenanceType;
  source_refs: unknown[];
  confidence: number;
  canon_status: CanonStatus;
  conflict_with: string[];
  knowledge_scope: Record<string, unknown>;
  gm_only: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdaptationSceneRow {
  id: string;
  adaptation_id: string;
  stable_key: string;
  sequence_no: number;
  title: string;
  synopsis: string;
  dramatic_goal: string;
  story_beats: unknown[];
  dialogue: unknown[];
  narration: unknown[];
  cast_entity_ids: string[];
  location_entity_id: string | null;
  prop_entity_ids: string[];
  wardrobe_refs: unknown[];
  continuity_state: Record<string, unknown>;
  knowledge_state: Record<string, unknown>;
  source_refs: unknown[];
  provenance_type: ProvenanceType;
  review_status: CanonStatus;
  manually_edited: boolean;
  content_hash: string;
  gm_only: boolean;
  created_at: string;
  updated_at: string;
}

export interface AdaptationAssetRow {
  id: string;
  adaptation_id: string;
  source_kind: string;
  source_id: string | null;
  canonical_entity_id: string | null;
  role: AssetRole;
  bucket: string | null;
  storage_path: string | null;
  media_type: string | null;
  byte_size: number | null;
  sha256: string | null;
  bundle_path: string | null;
  target_hints: Record<string, unknown>;
  is_canonical: boolean;
  resolution_status: ResolutionStatus;
  suggested_by: "explicit" | "ai" | "manual";
  created_at: string;
  updated_at: string;
}

export interface AdaptationSnapshotRow {
  id: string;
  adaptation_id: string;
  snapshot_hash: string;
  source_hashes: Record<string, string>;
  stats: Record<string, number>;
  created_at: string;
}

export interface AdaptationChangeSetRow {
  id: string;
  adaptation_id: string;
  from_snapshot_id: string | null;
  to_snapshot_id: string | null;
  added: ChangeSet["added"];
  changed: ChangeSet["changed"];
  removed: ChangeSet["removed"];
  impact: ChangeSet["impact"];
  status: "open" | "applied" | "dismissed";
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------- projects

export async function listAdaptations(campaignId: string): Promise<AdaptationProject[]> {
  return unwrap(
    await db
      .from("adaptation_projects")
      .select("*")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false }),
  ) as AdaptationProject[];
}

export async function getAdaptation(id: string): Promise<AdaptationProject> {
  return unwrap(
    await db.from("adaptation_projects").select("*").eq("id", id).single(),
  ) as AdaptationProject;
}

export async function createAdaptation(input: {
  campaign_id: string;
  name: string;
  source_mode?: SourceMode;
  spoiler_policy?: SpoilerPolicy;
  target_comic?: boolean;
  target_movie?: boolean;
}): Promise<AdaptationProject> {
  const { data: auth } = await supabase.auth.getUser();
  const created_by = auth.user?.id;
  if (!created_by) throw new Error("You must be signed in.");
  return unwrap(
    await db
      .from("adaptation_projects")
      .insert({ ...input, created_by })
      .select("*")
      .single(),
  ) as AdaptationProject;
}

export async function updateAdaptation(
  id: string,
  patch: Partial<Omit<AdaptationProject, "id" | "campaign_id" | "created_by">>,
): Promise<AdaptationProject> {
  return unwrap(
    await db.from("adaptation_projects").update(patch).eq("id", id).select("*").single(),
  ) as AdaptationProject;
}

export async function deleteAdaptation(id: string): Promise<void> {
  const { error } = await db.from("adaptation_projects").delete().eq("id", id);
  if (error) throw writeError(error.message);
}

// ----------------------------------------------------------------- sources

export async function listAdaptationSources(adaptationId: string): Promise<ScannedSource[]> {
  const rows = unwrap(
    await db
      .from("adaptation_sources")
      .select("source_key, source_type, source_id, source_hash, metadata")
      .eq("adaptation_id", adaptationId),
  ) as {
    source_key: string;
    source_type: string;
    source_id: string | null;
    source_hash: string;
    metadata: { label?: string };
  }[];
  return rows.map((row) => ({
    source_key: row.source_key,
    source_type: row.source_type,
    source_id: row.source_id,
    source_hash: row.source_hash,
    label: row.metadata?.label ?? "",
  }));
}

/** Replaces the stored source list with the freshly scanned one. */
export async function saveScan(
  adaptationId: string,
  snapshot: ScanSnapshot,
): Promise<AdaptationSnapshotRow> {
  await ensureSession();
  await db.from("adaptation_sources").delete().eq("adaptation_id", adaptationId);
  const rows = snapshot.sources.map((source) => ({
    adaptation_id: adaptationId,
    source_type: source.source_type,
    source_id: source.source_id ?? null,
    source_key: source.source_key,
    source_hash: source.source_hash,
    included: true,
    metadata: { label: source.label },
  }));
  for (let index = 0; index < rows.length; index += 500) {
    const chunk = rows.slice(index, index + 500);
    const { error } = await db.from("adaptation_sources").insert(chunk);
    if (error) throw writeError(error.message);
  }
  return unwrap(
    await db
      .from("adaptation_snapshots")
      .insert({
        adaptation_id: adaptationId,
        snapshot_hash: snapshot.snapshot_hash,
        source_hashes: Object.fromEntries(
          snapshot.sources.map((source) => [source.source_key, source.source_hash]),
        ),
        stats: snapshot.stats,
      })
      .select("*")
      .single(),
  ) as AdaptationSnapshotRow;
}

export async function listSnapshots(adaptationId: string): Promise<AdaptationSnapshotRow[]> {
  return unwrap(
    await db
      .from("adaptation_snapshots")
      .select("*")
      .eq("adaptation_id", adaptationId)
      .order("created_at", { ascending: false }),
  ) as AdaptationSnapshotRow[];
}

// ------------------------------------------------------------------- facts

export async function listFacts(adaptationId: string): Promise<AdaptationFactRow[]> {
  return unwrap(
    await db
      .from("adaptation_facts")
      .select("*")
      .eq("adaptation_id", adaptationId)
      .order("provenance_type", { ascending: true })
      .order("created_at", { ascending: true }),
  ) as AdaptationFactRow[];
}

export async function upsertFacts(
  adaptationId: string,
  facts: Omit<
    AdaptationFactRow,
    "id" | "adaptation_id" | "created_at" | "updated_at" | "reviewed_by" | "reviewed_at"
  >[],
): Promise<void> {
  if (!facts.length) return;
  await ensureSession();
  const rows = dedupeByKey(facts.map((fact) => ({ ...fact, adaptation_id: adaptationId })));
  for (let index = 0; index < rows.length; index += 400) {
    const { error } = await db
      .from("adaptation_facts")
      .upsert(rows.slice(index, index + 400), { onConflict: "adaptation_id,stable_key" });
    if (error) throw writeError(error.message);
  }
}

export async function reviewFact(id: string, status: CanonStatus): Promise<AdaptationFactRow> {
  const { data: auth } = await supabase.auth.getUser();
  return unwrap(
    await db
      .from("adaptation_facts")
      .update({
        canon_status: status,
        reviewed_by: auth.user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single(),
  ) as AdaptationFactRow;
}

export async function editFact(id: string, statement: string): Promise<AdaptationFactRow> {
  return unwrap(
    await db.from("adaptation_facts").update({ statement }).eq("id", id).select("*").single(),
  ) as AdaptationFactRow;
}

// ------------------------------------------------------------------ scenes

export async function listScenes(adaptationId: string): Promise<AdaptationSceneRow[]> {
  return unwrap(
    await db
      .from("adaptation_scenes")
      .select("*")
      .eq("adaptation_id", adaptationId)
      .order("sequence_no", { ascending: true }),
  ) as AdaptationSceneRow[];
}

export async function upsertScenes(
  adaptationId: string,
  scenes: Partial<AdaptationSceneRow>[],
  { preserveManualEdits = true }: { preserveManualEdits?: boolean } = {},
): Promise<void> {
  if (!scenes.length) return;
  await ensureSession();
  let incoming = scenes;
  if (preserveManualEdits) {
    const existing = await listScenes(adaptationId);
    const locked = new Set(
      existing.filter((scene) => scene.manually_edited).map((scene) => scene.stable_key),
    );
    incoming = scenes.filter((scene) => !locked.has(scene.stable_key ?? ""));
  }
  const rows = dedupeByKey(incoming.map((scene) => ({ ...scene, adaptation_id: adaptationId })));
  for (let index = 0; index < rows.length; index += 200) {
    const { error } = await db
      .from("adaptation_scenes")
      .upsert(rows.slice(index, index + 200), { onConflict: "adaptation_id,stable_key" });
    if (error) throw writeError(error.message);
  }
}

export async function updateScene(
  id: string,
  patch: Partial<AdaptationSceneRow>,
): Promise<AdaptationSceneRow> {
  return unwrap(
    await db
      .from("adaptation_scenes")
      .update({ ...patch, manually_edited: true })
      .eq("id", id)
      .select("*")
      .single(),
  ) as AdaptationSceneRow;
}

// ------------------------------------------------------------------ assets

export async function listAdaptationAssets(adaptationId: string): Promise<AdaptationAssetRow[]> {
  return unwrap(
    await db
      .from("adaptation_asset_links")
      .select("*")
      .eq("adaptation_id", adaptationId)
      .order("role", { ascending: true }),
  ) as AdaptationAssetRow[];
}

export async function replaceAdaptationAssets(
  adaptationId: string,
  rows: Partial<AdaptationAssetRow>[],
): Promise<void> {
  await db.from("adaptation_asset_links").delete().eq("adaptation_id", adaptationId);
  if (!rows.length) return;
  const payload = rows.map((row) => ({ ...row, adaptation_id: adaptationId }));
  for (let index = 0; index < payload.length; index += 400) {
    const { error } = await db
      .from("adaptation_asset_links")
      .insert(payload.slice(index, index + 400));
    if (error) throw writeError(error.message);
  }
}

export async function updateAdaptationAsset(
  id: string,
  patch: Partial<AdaptationAssetRow>,
): Promise<AdaptationAssetRow> {
  return unwrap(
    await db.from("adaptation_asset_links").update(patch).eq("id", id).select("*").single(),
  ) as AdaptationAssetRow;
}

// ------------------------------------------------------------ change sets

export async function saveChangeSet(
  adaptationId: string,
  fromSnapshotId: string | null,
  toSnapshotId: string | null,
  changes: ChangeSet,
): Promise<AdaptationChangeSetRow> {
  return unwrap(
    await db
      .from("adaptation_change_sets")
      .insert({
        adaptation_id: adaptationId,
        from_snapshot_id: fromSnapshotId,
        to_snapshot_id: toSnapshotId,
        added: changes.added,
        changed: changes.changed,
        removed: changes.removed,
        impact: changes.impact,
      })
      .select("*")
      .single(),
  ) as AdaptationChangeSetRow;
}

export async function listChangeSets(adaptationId: string): Promise<AdaptationChangeSetRow[]> {
  return unwrap(
    await db
      .from("adaptation_change_sets")
      .select("*")
      .eq("adaptation_id", adaptationId)
      .order("created_at", { ascending: false }),
  ) as AdaptationChangeSetRow[];
}

export async function setChangeSetStatus(
  id: string,
  status: "open" | "applied" | "dismissed",
): Promise<void> {
  const { error } = await db.from("adaptation_change_sets").update({ status }).eq("id", id);
  if (error) throw writeError(error.message);
}

// ---------------------------------------------------------------- targets

export async function listTargets(adaptationId: string) {
  return unwrap(
    await db.from("adaptation_targets").select("*").eq("adaptation_id", adaptationId),
  ) as {
    id: string;
    target_system: "rx_comics" | "moviesmith";
    target_project_external_id: string | null;
    last_sync_hash: string | null;
    last_synced_at: string | null;
    metadata: Record<string, unknown>;
  }[];
}

export async function upsertTarget(
  adaptationId: string,
  targetSystem: "rx_comics" | "moviesmith",
  patch: {
    target_project_external_id?: string | null;
    last_sync_hash?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await db.from("adaptation_targets").upsert(
    {
      adaptation_id: adaptationId,
      target_system: targetSystem,
      ...patch,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: "adaptation_id,target_system" },
  );
  if (error) throw writeError(error.message);
}
