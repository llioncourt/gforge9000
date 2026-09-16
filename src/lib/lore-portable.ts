import type { TablesInsert } from "@/integrations/supabase/types";
import type { EntityRow, RelationshipRow } from "@/lib/lore";
import { normalizeVisibility } from "@/lib/visibility";

/**
 * Portable campaign lore (UCF-LORE v1). Pure transforms only — no IO, so the
 * shape can be unit tested and reused by any importer.
 *
 * Deliberately excluded: per-player knowledge grants and revision history
 * (both are tied to accounts of the source campaign), and asset binaries.
 */
export interface PortableEntity {
  key: string;
  kind: string;
  name: string;
  status: string;
  visibility: string;
  summary: string | null;
  description: string | null;
  player_description: string | null;
  gm_notes: string | null;
  aliases: string[];
  tags: string[];
  image_url: string | null;
  sort_order: number;
  parent_key: string | null;
  data: unknown;
}

export interface PortableRelationship {
  source_key: string;
  target_key: string;
  rel_type: string;
  description: string | null;
  gm_description: string | null;
  start_label: string | null;
  end_label: string | null;
  strength: number | null;
  is_current: boolean;
  visibility: string;
}

export interface PortableLore {
  format: "ucf-campaign-lore";
  version: 1;
  exported_at: string;
  campaign_name: string;
  entities: PortableEntity[];
  relationships: PortableRelationship[];
}

/** Stable, human-readable key so imports stay readable and re-importable. */
export function entityKey(row: { id: string; kind: string; name: string }): string {
  const slug = row.name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${row.kind.toLowerCase()}:${slug || "untitled"}:${row.id.slice(0, 8)}`;
}

export function toPortableLore(
  campaignName: string,
  entities: EntityRow[],
  relationships: RelationshipRow[],
  now = new Date().toISOString(),
): PortableLore {
  const keys = new Map<string, string>();
  for (const row of entities) keys.set(row.id, entityKey(row));

  return {
    format: "ucf-campaign-lore",
    version: 1,
    exported_at: now,
    campaign_name: campaignName,
    entities: entities.map((row) => ({
      key: keys.get(row.id)!,
      kind: row.kind,
      name: row.name,
      status: row.status,
      visibility: row.visibility,
      summary: row.summary,
      description: row.description,
      player_description: row.player_description,
      gm_notes: row.gm_notes,
      aliases: row.aliases ?? [],
      tags: row.tags ?? [],
      image_url: row.image_url,
      sort_order: row.sort_order,
      parent_key: row.parent_id ? (keys.get(row.parent_id) ?? null) : null,
      data: row.data,
    })),
    relationships: relationships
      .filter((rel) => keys.has(rel.source_id) && keys.has(rel.target_id))
      .map((rel) => ({
        source_key: keys.get(rel.source_id)!,
        target_key: keys.get(rel.target_id)!,
        rel_type: rel.rel_type,
        description: rel.description,
        gm_description: rel.gm_description,
        start_label: rel.start_label,
        end_label: rel.end_label,
        strength: rel.strength,
        is_current: rel.is_current,
        visibility: rel.visibility,
      })),
  };
}

export function parsePortableLore(raw: string): PortableLore {
  const parsed = JSON.parse(raw) as PortableLore;
  if (parsed?.format !== "ucf-campaign-lore") {
    throw new Error("Unrecognised file. Expected a campaign lore export.");
  }
  if (parsed.version !== 1) throw new Error(`Unsupported lore export version ${parsed.version}.`);
  if (!Array.isArray(parsed.entities)) throw new Error("This export has no entries.");
  return {
    ...parsed,
    entities: parsed.entities,
    relationships: Array.isArray(parsed.relationships) ? parsed.relationships : [],
  };
}

/** Rows ready to insert, parents last-resolved by the caller via the returned keys. */
export function entityInserts(
  file: PortableLore,
  campaignId: string,
): { key: string; row: TablesInsert<"entities">; parent_key: string | null }[] {
  return file.entities.map((e) => ({
    key: e.key,
    parent_key: e.parent_key,
    row: {
      campaign_id: campaignId,
      kind: e.kind,
      name: e.name || "Untitled",
      status: e.status,
      visibility: normalizeVisibility(e.visibility),
      summary: e.summary,
      description: e.description,
      player_description: e.player_description,
      gm_notes: e.gm_notes,
      aliases: e.aliases ?? [],
      tags: e.tags ?? [],
      image_url: e.image_url,
      sort_order: e.sort_order ?? 0,
      data: (e.data ?? {}) as NonNullable<TablesInsert<"entities">["data"]>,
    },
  }));
}

export function relationshipInserts(
  file: PortableLore,
  campaignId: string,
  idByKey: Map<string, string>,
): TablesInsert<"entity_relationships">[] {
  return file.relationships
    .filter((rel) => idByKey.has(rel.source_key) && idByKey.has(rel.target_key))
    .map((rel) => ({
      campaign_id: campaignId,
      source_id: idByKey.get(rel.source_key)!,
      target_id: idByKey.get(rel.target_key)!,
      rel_type: rel.rel_type,
      description: rel.description,
      gm_description: rel.gm_description,
      start_label: rel.start_label,
      end_label: rel.end_label,
      strength: rel.strength,
      is_current: rel.is_current ?? true,
      visibility: normalizeVisibility(rel.visibility),
    }));
}
