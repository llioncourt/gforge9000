import { createRelationships, updateEntity, upsertEntitiesByImportKey } from "@/lib/lore";
import { entityInserts, relationshipInserts, type PortableLore } from "@/lib/lore-portable";

export interface LoreImportResult {
  entities: number;
  relationships: number;
}

/**
 * Imports a portable lore file into a campaign, preserving nesting and links.
 *
 * Re-importing the same file updates the records it created before instead of
 * adding a second copy: every entry carries a stable import key, and
 * relationships are de-duplicated on (campaign, source, target, type).
 */
export async function importLore(
  campaignId: string,
  file: PortableLore,
): Promise<LoreImportResult> {
  const planned = entityInserts(file, campaignId);
  const idByImportKey = await upsertEntitiesByImportKey(
    campaignId,
    planned.map((item) => item.row as typeof item.row & { import_key: string }),
  );

  const idByKey = new Map<string, string>();
  for (const item of planned) {
    const id = idByImportKey.get(String(item.row.import_key));
    if (id) idByKey.set(item.key, id);
  }

  for (const item of planned) {
    if (!item.parent_key) continue;
    const parentId = idByKey.get(item.parent_key);
    const childId = idByKey.get(item.key);
    if (!parentId || !childId) continue;
    await updateEntity(childId, { parent_id: parentId });
  }

  const rels = relationshipInserts(file, campaignId, idByKey);
  const written = await createRelationships(rels);

  return { entities: idByKey.size, relationships: written };
}
