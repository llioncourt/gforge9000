/**
 * Asset resolver.
 *
 * Explicit links always win: a portrait attached to a character, an image
 * attached to a lore entry, a map's own file. AI matching is only ever a
 * *suggestion* that lands as `ambiguous` for the GM to confirm.
 */

import type { AssetRole, ResolutionStatus } from "@/lib/adaptation/types";
import { stableKey } from "@/lib/adaptation/hash";

export interface CandidateAsset {
  source_kind: string;
  source_id: string | null;
  title: string;
  bucket: string;
  storage_path: string;
  media_type: string | null;
  byte_size: number | null;
  /** Set when the campaign itself already ties this file to an entity. */
  explicit_entity_id?: string | null;
  role_hint?: AssetRole;
}

export interface EntityTarget {
  id: string;
  name: string;
  aliases: string[];
  kind: string;
}

export interface ResolvedAsset {
  asset_key: string;
  source_kind: string;
  source_id: string | null;
  title: string;
  bucket: string;
  storage_path: string;
  media_type: string | null;
  byte_size: number | null;
  canonical_entity_id: string | null;
  role: AssetRole;
  resolution_status: ResolutionStatus;
  suggested_by: "explicit" | "ai" | "manual";
  is_canonical: boolean;
  matches: string[];
}

const KIND_ROLE: Record<string, AssetRole> = {
  NPC: "character",
  PC: "character",
  CHARACTER: "character",
  LOCATION: "location",
  SITE: "location",
  ITEM: "prop",
  ARTIFACT: "prop",
};

function roleForKind(kind: string): AssetRole {
  return KIND_ROLE[kind.toUpperCase()] ?? "reference";
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Matches candidate files to entities. Name matching is deliberately strict —
 * a full normalized match on the name or an alias — so a near-miss is reported
 * as unresolved rather than silently linked to the wrong character.
 */
export function resolveAssets(
  candidates: CandidateAsset[],
  entities: EntityTarget[],
): ResolvedAsset[] {
  const byName = new Map<string, EntityTarget[]>();
  for (const entity of entities) {
    for (const label of [entity.name, ...entity.aliases]) {
      const key = normalize(label);
      if (!key) continue;
      byName.set(key, [...(byName.get(key) ?? []), entity]);
    }
  }

  return candidates.map((candidate) => {
    const key = stableKey("asset", candidate.bucket, candidate.storage_path);
    const base = {
      asset_key: key,
      source_kind: candidate.source_kind,
      source_id: candidate.source_id,
      title: candidate.title,
      bucket: candidate.bucket,
      storage_path: candidate.storage_path,
      media_type: candidate.media_type,
      byte_size: candidate.byte_size,
    };

    if (candidate.explicit_entity_id) {
      const entity = entities.find((e) => e.id === candidate.explicit_entity_id);
      return {
        ...base,
        canonical_entity_id: candidate.explicit_entity_id,
        role: candidate.role_hint ?? (entity ? roleForKind(entity.kind) : "reference"),
        resolution_status: "resolved",
        suggested_by: "explicit",
        is_canonical: true,
        matches: entity ? [entity.id] : [],
      };
    }

    const matched = byName.get(normalize(candidate.title)) ?? [];
    if (matched.length === 1) {
      const entity = matched[0]!;
      return {
        ...base,
        canonical_entity_id: null,
        role: candidate.role_hint ?? roleForKind(entity.kind),
        resolution_status: "ambiguous",
        suggested_by: "ai",
        is_canonical: false,
        matches: [entity.id],
      };
    }
    if (matched.length > 1) {
      return {
        ...base,
        canonical_entity_id: null,
        role: candidate.role_hint ?? "reference",
        resolution_status: "ambiguous",
        suggested_by: "ai",
        is_canonical: false,
        matches: matched.map((entity) => entity.id),
      };
    }

    return {
      ...base,
      canonical_entity_id: null,
      role: candidate.role_hint ?? "reference",
      resolution_status: "unresolved",
      suggested_by: "explicit",
      is_canonical: false,
      matches: [],
    };
  });
}

export interface ResolverStats {
  resolved: number;
  unresolved: number;
  ambiguous: number;
  /** Entities with no picture at all — the "missing visual references" count. */
  missingVisuals: string[];
}

export function resolverStats(resolved: ResolvedAsset[], entities: EntityTarget[]): ResolverStats {
  const covered = new Set(
    resolved
      .filter((asset) => asset.resolution_status === "resolved")
      .map((asset) => asset.canonical_entity_id)
      .filter((id): id is string => !!id),
  );
  return {
    resolved: resolved.filter((a) => a.resolution_status === "resolved").length,
    unresolved: resolved.filter((a) => a.resolution_status === "unresolved").length,
    ambiguous: resolved.filter((a) => a.resolution_status === "ambiguous").length,
    missingVisuals: entities.filter((entity) => !covered.has(entity.id)).map((entity) => entity.id),
  };
}

/** Drops byte-identical duplicates, keeping the first (canonical) occurrence. */
export function dedupeByHash<T extends { sha256: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.sha256)) continue;
    seen.add(item.sha256);
    out.push(item);
  }
  return out;
}
