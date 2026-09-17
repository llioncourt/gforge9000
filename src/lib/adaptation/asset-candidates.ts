/**
 * Collects every visual the campaign already owns so the resolver can link
 * them to entities. Explicit links (an entity image, a character portrait,
 * a map file) are carried through so they always win over name matching.
 */

import { listAssets, ASSET_BUCKET } from "@/lib/assets";
import { listMaps, MAP_BUCKET } from "@/lib/battlemap";
import { listEntities } from "@/lib/lore";
import { listCampaignCharacters } from "@/lib/api";
import { PORTRAIT_BUCKET } from "@/lib/portrait";
import type { CandidateAsset, EntityTarget } from "@/lib/adaptation/assets";

export async function collectAssetCandidates(
  campaignId: string,
): Promise<{ candidates: CandidateAsset[]; entities: EntityTarget[] }> {
  const [entities, assets, maps, characters] = await Promise.all([
    listEntities(campaignId),
    listAssets(campaignId).catch(() => []),
    listMaps(campaignId).catch(() => []),
    listCampaignCharacters(campaignId).catch(() => []),
  ]);

  const candidates: CandidateAsset[] = [];

  for (const entity of entities) {
    if (!entity.image_url) continue;
    candidates.push({
      source_kind: "entity_image",
      source_id: entity.id,
      title: entity.name,
      bucket: entity.image_url.includes("/") ? ASSET_BUCKET : PORTRAIT_BUCKET,
      storage_path: entity.image_url,
      media_type: null,
      byte_size: null,
      explicit_entity_id: entity.id,
    });
  }

  for (const character of characters as {
    id: string;
    name: string;
    portrait_path?: string | null;
  }[]) {
    if (!character.portrait_path) continue;
    const linked = entities.find((entity) => entity.character_id === character.id);
    candidates.push({
      source_kind: "character_portrait",
      source_id: character.id,
      title: character.name,
      bucket: PORTRAIT_BUCKET,
      storage_path: character.portrait_path,
      media_type: null,
      byte_size: null,
      explicit_entity_id: linked?.id ?? null,
      role_hint: "character",
    });
  }

  for (const asset of assets) {
    if (!asset.storage_path) continue;
    candidates.push({
      source_kind: "library_file",
      source_id: asset.id,
      title: asset.title,
      bucket: ASSET_BUCKET,
      storage_path: asset.storage_path,
      media_type: null,
      byte_size: null,
    });
  }

  for (const map of maps) {
    if (!map.image_path) continue;
    candidates.push({
      source_kind: "map",
      source_id: map.id,
      title: map.name,
      bucket: MAP_BUCKET,
      storage_path: map.image_path,
      media_type: null,
      byte_size: null,
      role_hint: "location",
    });
  }

  return {
    candidates,
    entities: entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      aliases: entity.aliases ?? [],
      kind: entity.kind,
    })),
  };
}
