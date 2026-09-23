import { supabase } from "@/integrations/supabase/client";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

export type EntityRow = Tables<"entities">;
export type RelationshipRow = Tables<"entity_relationships">;
export type GrantRow = Tables<"knowledge_grants">;
export type EntityRevisionRow = Tables<"entity_revisions">;

function unwrap<T>(res: { data: T; error: { message: string } | null }): NonNullable<T> {
  if (res.error) throw new Error(res.error.message);
  return res.data as NonNullable<T>;
}

// Reads go through the `list_entities_safe` / `list_relationships_safe`
// functions, which apply the same visibility rules as the base tables and strip
// GM-only notes and GM-only data keys for non-GM callers.
// Writes still target the base tables (GM / owner only).
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- RPCs created after types were generated
const rpc = supabase.rpc.bind(supabase) as any;

export async function listEntities(campaignId: string): Promise<EntityRow[]> {
  return unwrap(
    await rpc("list_entities_safe", { _campaign: campaignId })
      .order("kind", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
  ) as EntityRow[];
}

export async function getEntity(id: string): Promise<EntityRow> {
  return unwrap(await rpc("list_entities_safe").eq("id", id).single()) as EntityRow;
}

export async function createEntity(input: TablesInsert<"entities">): Promise<EntityRow> {
  return unwrap(await supabase.from("entities").insert(input).select("*").single());
}

/** Inserts many entities in one statement: all of them land, or none do. */
export async function createEntities(rows: TablesInsert<"entities">[]): Promise<EntityRow[]> {
  if (rows.length === 0) return [];
  return unwrap(await supabase.from("entities").insert(rows).select("*"));
}

/**
 * Writes entities that carry an import key, updating the rows a previous
 * import of the same file created instead of adding a second copy.
 * Returns the row id for every import key handled.
 */
export async function upsertEntitiesByImportKey(
  campaignId: string,
  rows: (TablesInsert<"entities"> & { import_key: string })[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (rows.length === 0) return out;

  const keys = rows.map((row) => row.import_key);
  const existing = unwrap(
    await supabase
      .from("entities")
      .select("id, import_key")
      .eq("campaign_id", campaignId)
      .in("import_key", keys),
  );
  const idByKey = new Map<string, string>();
  for (const row of existing) if (row.import_key) idByKey.set(row.import_key, row.id);

  const toInsert = rows.filter((row) => !idByKey.has(row.import_key));
  const inserted = await createEntities(toInsert);
  for (const row of inserted) if (row.import_key) out.set(row.import_key, row.id);

  for (const row of rows) {
    const id = idByKey.get(row.import_key);
    if (!id) continue;
    const { import_key: _key, campaign_id: _campaign, ...patch } = row;
    await updateEntity(id, patch as TablesUpdate<"entities">);
    out.set(row.import_key, id);
  }
  return out;
}

/** Inserts relationships, ignoring ones that already exist in the campaign. */
export async function createRelationships(
  rows: TablesInsert<"entity_relationships">[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const data = unwrap(
    await supabase
      .from("entity_relationships")
      .upsert(rows, {
        onConflict: "campaign_id,source_id,target_id,rel_type",
        ignoreDuplicates: true,
      })
      .select("id"),
  );
  return data.length;
}

/**
 * Writes to the base table (GM or owner) and reads the result back through the
 * filtered read function: direct table reads are GM-only, so a non-GM owner
 * must never ask for the written row with `RETURNING`.
 */
export async function updateEntity(
  id: string,
  patch: TablesUpdate<"entities">,
): Promise<EntityRow> {
  const { error } = await supabase.from("entities").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  return getEntity(id);
}

export async function deleteEntity(id: string): Promise<void> {
  const { error } = await supabase.from("entities").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listRelationships(campaignId: string): Promise<RelationshipRow[]> {
  return unwrap(
    await rpc("list_relationships_safe", { _campaign: campaignId }).order("created_at", {
      ascending: true,
    }),
  ) as RelationshipRow[];
}

export async function createRelationship(
  input: TablesInsert<"entity_relationships">,
): Promise<RelationshipRow> {
  return unwrap(await supabase.from("entity_relationships").insert(input).select("*").single());
}

export async function deleteRelationship(id: string): Promise<void> {
  const { error } = await supabase.from("entity_relationships").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listGrants(entityId: string): Promise<GrantRow[]> {
  return unwrap(await supabase.from("knowledge_grants").select("*").eq("entity_id", entityId));
}

export async function listCampaignGrants(campaignId: string): Promise<GrantRow[]> {
  return unwrap(await supabase.from("knowledge_grants").select("*").eq("campaign_id", campaignId));
}

export async function grantKnowledge(input: TablesInsert<"knowledge_grants">): Promise<GrantRow> {
  return unwrap(await supabase.from("knowledge_grants").insert(input).select("*").single());
}

export async function revokeKnowledge(id: string): Promise<void> {
  const { error } = await supabase.from("knowledge_grants").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listEntityRevisions(entityId: string): Promise<EntityRevisionRow[]> {
  return unwrap(
    await supabase
      .from("entity_revisions")
      .select("*")
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(30),
  );
}

export async function snapshotEntity(row: EntityRow, label?: string): Promise<void> {
  const { error } = await supabase.from("entity_revisions").insert({
    campaign_id: row.campaign_id,
    entity_id: row.id,
    label: label ?? null,
    snapshot: row as unknown as Record<string, unknown>,
  } as TablesInsert<"entity_revisions">);
  if (error) throw new Error(error.message);
}

export type EntityData = Record<string, unknown>;

export function dataValue(row: EntityRow, key: string): string {
  const data = (row.data ?? {}) as EntityData;
  const value = data[key];
  if (value == null) return "";
  if (Array.isArray(value)) return value.join("\n");
  return String(value);
}

export function withDataValue(
  row: EntityRow,
  key: string,
  value: string,
  asList: boolean,
): EntityData {
  const data = { ...((row.data ?? {}) as EntityData) };
  if (!value.trim()) delete data[key];
  else data[key] = asList ? value.split("\n").filter((line) => line.trim()) : value;
  return data;
}
