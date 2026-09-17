/**
 * Change sets between two campaign scans.
 *
 * A scan is reduced to `stable key -> source hash`. Comparing two of those maps
 * tells us exactly what was added, changed or removed, and the impact map says
 * which adapted scenes each change touches.
 */

import type { SourceRef } from "@/lib/adaptation/types";

export interface ScannedSource {
  source_key: string;
  source_type: string;
  source_id?: string | null;
  source_hash: string;
  label: string;
}

export type SourceMap = Record<string, ScannedSource>;

export interface ChangeEntry {
  source_key: string;
  source_type: string;
  label: string;
  previous_hash?: string;
  next_hash?: string;
}

export interface ImpactEntry {
  source_key: string;
  scene_keys: string[];
  fact_keys: string[];
  comic_pages: number;
  movie_scenes: number;
}

export interface ChangeSet {
  added: ChangeEntry[];
  changed: ChangeEntry[];
  removed: ChangeEntry[];
  impact: ImpactEntry[];
  unchanged: number;
}

export function toSourceMap(sources: ScannedSource[]): SourceMap {
  const map: SourceMap = {};
  for (const source of sources) map[source.source_key] = source;
  return map;
}

/** Items that reference sources, used to compute the impact of each change. */
export interface ImpactTarget {
  stable_key: string;
  kind: "scene" | "fact";
  source_refs: SourceRef[];
}

export function diffSources(
  previous: SourceMap,
  next: SourceMap,
  targets: ImpactTarget[] = [],
): ChangeSet {
  const added: ChangeEntry[] = [];
  const changed: ChangeEntry[] = [];
  const removed: ChangeEntry[] = [];
  let unchanged = 0;

  for (const key of Object.keys(next).sort()) {
    const to = next[key]!;
    const from = previous[key];
    if (!from) {
      added.push({
        source_key: key,
        source_type: to.source_type,
        label: to.label,
        next_hash: to.source_hash,
      });
    } else if (from.source_hash !== to.source_hash) {
      changed.push({
        source_key: key,
        source_type: to.source_type,
        label: to.label,
        previous_hash: from.source_hash,
        next_hash: to.source_hash,
      });
    } else {
      unchanged++;
    }
  }

  for (const key of Object.keys(previous).sort()) {
    if (next[key]) continue;
    const from = previous[key]!;
    removed.push({
      source_key: key,
      source_type: from.source_type,
      label: from.label,
      previous_hash: from.source_hash,
    });
  }

  const touched = [...added, ...changed, ...removed].map((entry) => entry.source_key);
  return { added, changed, removed, unchanged, impact: impactMap(touched, targets) };
}

/** For each touched source, which adapted scenes and facts depend on it. */
export function impactMap(sourceKeys: string[], targets: ImpactTarget[]): ImpactEntry[] {
  return sourceKeys.map((sourceKey) => {
    const dependents = targets.filter((target) =>
      target.source_refs.some((ref) => ref.source_key === sourceKey),
    );
    const sceneKeys = dependents.filter((d) => d.kind === "scene").map((d) => d.stable_key);
    const factKeys = dependents.filter((d) => d.kind === "fact").map((d) => d.stable_key);
    return {
      source_key: sourceKey,
      scene_keys: sceneKeys,
      fact_keys: factKeys,
      // One adapted scene maps to one movie scene and at least one comic page.
      comic_pages: sceneKeys.length,
      movie_scenes: sceneKeys.length,
    };
  });
}

export function isEmptyChangeSet(set: ChangeSet): boolean {
  return set.added.length === 0 && set.changed.length === 0 && set.removed.length === 0;
}

/**
 * A scene the GM edited by hand must never be silently overwritten by a
 * re-scan; it is reported as a conflict instead.
 */
export interface UpdateDecision {
  stable_key: string;
  action: "update" | "keep_local" | "conflict";
  reason: string;
}

export function planSceneUpdates(
  scenes: { stable_key: string; manually_edited: boolean; content_hash: string }[],
  impactedSceneKeys: Set<string>,
): UpdateDecision[] {
  return scenes
    .filter((scene) => impactedSceneKeys.has(scene.stable_key))
    .map((scene) =>
      scene.manually_edited
        ? {
            stable_key: scene.stable_key,
            action: "conflict" as const,
            reason: "manually_edited",
          }
        : { stable_key: scene.stable_key, action: "update" as const, reason: "source_changed" },
    );
}
