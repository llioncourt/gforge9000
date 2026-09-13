import { createEntity, createRelationship, updateEntity } from "@/lib/lore";
import { entityInserts, relationshipInserts, type PortableLore } from "@/lib/lore-portable";

export interface LoreImportResult {
  entities: number;
  relationships: number;
}

/** Imports a portable lore file into a campaign, preserving nesting and links. */
export async function importLore(
  campaignId: string,
  file: PortableLore,
): Promise<LoreImportResult> {
  const planned = entityInserts(file, campaignId);
  const idByKey = new Map<string, string>();

  for (const item of planned) {
    const created = await createEntity(item.row);
    idByKey.set(item.key, created.id);
  }

  for (const item of planned) {
    if (!item.parent_key) continue;
    const parentId = idByKey.get(item.parent_key);
    const childId = idByKey.get(item.key);
    if (!parentId || !childId) continue;
    await updateEntity(childId, { parent_id: parentId });
  }

  const rels = relationshipInserts(file, campaignId, idByKey);
  for (const rel of rels) await createRelationship(rel);

  return { entities: idByKey.size, relationships: rels.length };
}
