import { zipSync, type Zippable } from "fflate";

import { supabase } from "@/integrations/supabase/client";
import { getCampaign } from "@/lib/api";
import { listEntities } from "@/lib/lore";
import { slugify } from "@/lib/portable";
import {
  listAdaptationAssets,
  listAdaptationSources,
  listFacts,
  listScenes,
  type AdaptationProject,
} from "@/lib/adaptation/api";
import { dedupeByHash } from "@/lib/adaptation/assets";
import { sha256Hex } from "@/lib/adaptation/hash";
import {
  ADAPTATION_FORMAT,
  ADAPTATION_VERSION,
  MAX_ADAPTATION_BUNDLE_BYTES,
  adaptationManifestSchema,
  isSafeBundlePath,
  referencedFiles,
  validateAdaptationManifest,
  type AdaptationAsset,
  type AdaptationManifest,
  type AdaptationScene,
  type BibleRecord,
  type StoryBible,
} from "@/lib/adaptation/protocol";
import { buildComicProjection, buildMovieProjection } from "@/lib/adaptation/projections";
import {
  buildAdventureModuleProjection,
  buildBookNarrativeProjection,
  DEFAULT_ADVENTURE_MODULE,
  DEFAULT_BOOK_NARRATIVE,
  type StatBlockInput,
} from "@/lib/adaptation/book-projections";
import { deriveStats } from "@/rules/attributes";
import type { CharacterRecord } from "@/rules/types";
import type { AdaptationTarget } from "@/lib/adaptation/types";
import { renderAdventureModuleMarkdown, renderBookMarkdown } from "@/lib/adaptation/book-render";
import { buildAdaptationReadme } from "@/lib/adaptation/bundle-docs";

/**
 * Bundle export.
 *
 * Produces `adaptation.json` plus the binaries it references, deduplicated by
 * content hash, validated before anything is written, and with every path
 * checked so a crafted title can never escape the bundle folder.
 */

export interface ExportStep {
  label: string;
  done: number;
  total: number;
  percent: number;
}

export type ExportProgress = (step: ExportStep) => void;

class Bundle {
  readonly files: Zippable = {};
  private used = new Set<string>();

  reserve(folder: string, base: string, ext: string) {
    const stem = slugify(base) || "file";
    let path = `${folder}/${stem}.${ext}`;
    let n = 2;
    while (this.used.has(path)) path = `${folder}/${stem}-${n++}.${ext}`;
    this.used.add(path);
    return path;
  }

  add(path: string, bytes: Uint8Array) {
    if (!isSafeBundlePath(path)) throw new Error(`Refusing to write unsafe path "${path}".`);
    (this.files as Record<string, Uint8Array>)[path] = bytes;
  }
}

function extensionOf(path: string, fallback: string) {
  const ext = path.split("/").pop()?.split(".").pop();
  return ext && ext.length <= 5 ? ext.toLowerCase() : fallback;
}

async function download(bucket: string, path: string): Promise<Uint8Array | null> {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

function bibleRecord(
  entity: {
    id: string;
    name: string;
    kind: string;
    summary: string | null;
    description: string | null;
    player_description: string | null;
    aliases: string[] | null;
    tags: string[] | null;
    visibility: string;
  },
  assetKeys: string[],
): BibleRecord {
  return {
    entity_id: entity.id,
    key: slugify(entity.name) || entity.id,
    name: entity.name,
    kind: entity.kind,
    biography: entity.description ?? entity.player_description ?? "",
    visual_description: entity.summary ?? "",
    traits: entity.tags ?? [],
    asset_keys: assetKeys,
    source_refs: [
      {
        source_type: "entity",
        source_key: `entity:${entity.id}`,
        source_id: entity.id,
        label: entity.name,
      },
    ],
    gm_only: entity.visibility === "GM_ONLY" || entity.visibility === "UNREVEALED",
  };
}

const KIND_GROUP: Record<string, "cast" | "locations" | "props"> = {
  NPC: "cast",
  PC: "cast",
  CHARACTER: "cast",
  LOCATION: "locations",
  SITE: "locations",
  ITEM: "props",
  ARTIFACT: "props",
};

/** Assembles the manifest from stored rows. Pure apart from the reads it is given. */
export function assembleManifest(args: {
  project: AdaptationProject;
  campaign: { id: string; name: string };
  facts: AdaptationManifest["facts"];
  scenes: AdaptationScene[];
  assets: AdaptationAsset[];
  cast: BibleRecord[];
  locations: BibleRecord[];
  props: BibleRecord[];
  wardrobe: BibleRecord[];
  storyBible: StoryBible;
  sources: {
    source_key: string;
    source_type: string;
    source_id: string | null;
    source_hash: string;
    label: string;
  }[];
  snapshotHash: string;
  statBlocks?: Record<string, StatBlockInput>;
  playerCharacterIds?: string[];
}): AdaptationManifest {
  const {
    project,
    campaign,
    facts,
    scenes,
    assets,
    cast,
    locations,
    props,
    wardrobe,
    storyBible,
    sources,
    snapshotHash,
  } = args;

  const projectionInput = { scenes, cast, locations, props, wardrobe, storyBible };
  const creative = project.creative_settings ?? {};

  const comic = project.target_comic
    ? buildComicProjection(projectionInput, {
        series_title: creative.comic?.series_title ?? campaign.name,
        series_subtitle: creative.comic?.series_subtitle ?? null,
        issue_number: creative.comic?.issue_number ?? 1,
        issue_title: creative.comic?.issue_title ?? project.name,
        page_target: creative.comic?.page_target ?? null,
        density: creative.comic?.density ?? "standard",
        genre: creative.comic?.genre ?? storyBible.genre,
        art_direction: creative.comic?.art_direction ?? storyBible.tone,
      })
    : null;

  const movie = project.target_movie
    ? buildMovieProjection(projectionInput, {
        title: creative.movie?.title ?? project.name,
        logline: creative.movie?.logline ?? storyBible.logline,
        runtime_target_minutes: creative.movie?.runtime_target_minutes ?? null,
        aspect_ratio: creative.movie?.aspect_ratio ?? "16:9",
        language: creative.movie?.language ?? "en",
        style: creative.movie?.style ?? {},
      })
    : null;

  const bookInput = {
    scenes,
    facts,
    cast,
    locations,
    props,
    storyBible,
    direction: creative.narrative ?? {},
    assets,
    statBlocks: args.statBlocks ?? {},
    playerCharacterIds: args.playerCharacterIds ?? [],
  };

  const book_narrative = project.target_book_narrative
    ? buildBookNarrativeProjection(bookInput, {
        ...DEFAULT_BOOK_NARRATIVE,
        ...stripNullish(creative.book_narrative ?? {}),
        title: creative.book_narrative?.title || project.name,
      })
    : null;

  const adventure_module = project.target_adventure_module
    ? buildAdventureModuleProjection(bookInput, {
        ...DEFAULT_ADVENTURE_MODULE,
        ...stripNullish(creative.adventure_module ?? {}),
        game_system: "gurps_4e",
        adaptation_level: "complete_module",
        title: creative.adventure_module?.title || project.name,
      })
    : null;

  const manifest = {
    format: ADAPTATION_FORMAT,
    version: ADAPTATION_VERSION,
    exported_at: new Date().toISOString(),
    source_campaign: {
      campaign_id: campaign.id,
      name: campaign.name,
      revision: snapshotHash,
      ucf_package_format: "ucf-campaign-package",
      ucf_package_version: 1,
    },
    adaptation: {
      id: project.id,
      name: project.name,
      source_mode: project.source_mode,
      spoiler_policy: project.spoiler_policy,
      source_scope: project.source_scope ?? {},
      creative_settings: (project.creative_settings ?? {}) as Record<string, unknown>,
    },
    story_bible: storyBible,
    facts,
    conflicts: facts
      .filter((fact) => fact.provenance_type === "conflict")
      .map((fact) => ({
        stable_key: fact.stable_key,
        statement: fact.statement,
        conflicting_keys: fact.conflict_with,
        source_refs: fact.source_refs,
      })),
    cast,
    locations,
    props,
    wardrobe,
    scenes,
    assets,
    targets: { comic, movie, book_narrative, adventure_module },
    sync: {
      sources,
      scene_hashes: Object.fromEntries(
        scenes.map((scene) => [scene.stable_key, scene.content_hash]),
      ),
      target_mapping_hints: {
        comic: comic ? { manifest_kind: "rx-comics-v2-manifest", manifest_version: "1.0" } : null,
        movie: movie ? { format: "moviesmith.movie.v1", scene_pack: "moviesmith.pack.v2" } : null,
        book_narrative: book_narrative
          ? {
              format: "awd.book.narrative.v1",
              chapter_scenes: Object.fromEntries(
                book_narrative.target_projection.chapters.map((c) => [c.key, c.scene_keys]),
              ),
            }
          : null,
        adventure_module: adventure_module
          ? {
              format: "awd.adventure-module.gurps.v1",
              encounter_scenes: Object.fromEntries(
                adventure_module.target_projection.encounters.map((e) => [e.key, e.scene_key]),
              ),
            }
          : null,
      },
      snapshot_hash: snapshotHash,
    },
  };

  return adaptationManifestSchema.parse(manifest);
}

function stripNullish<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== null && v !== undefined && v !== ""),
  ) as Partial<T>;
}

/** GURPS stat blocks for entities linked to a character sheet, derived by the rules engine. */
async function loadStatBlocks(
  entities: { id: string; kind: string; character_id: string | null }[],
): Promise<{ statBlocks: Record<string, StatBlockInput>; playerCharacterIds: string[] }> {
  const linked = entities.filter((entity) => entity.character_id);
  const playerCharacterIds = entities.filter((e) => e.kind.toUpperCase() === "PC").map((e) => e.id);
  if (!linked.length) return { statBlocks: {}, playerCharacterIds };
  const { data } = await supabase
    .from("characters")
    .select("*")
    .in(
      "id",
      linked.map((entity) => entity.character_id!),
    );
  const statBlocks: Record<string, StatBlockInput> = {};
  for (const entity of linked) {
    const row = (data ?? []).find((c) => c.id === entity.character_id);
    if (!row) continue;
    if (!row.is_npc) playerCharacterIds.push(entity.id);
    const record = row as unknown as CharacterRecord;
    const stats = deriveStats(record);
    statBlocks[entity.id] = {
      st: stats.st,
      dx: stats.dx,
      iq: stats.iq,
      ht: stats.ht,
      hp: stats.hp,
      will: stats.will,
      per: stats.per,
      fp: stats.fp,
      basic_speed: stats.basicSpeed,
      basic_move: stats.basicMove,
      dodge: stats.dodge,
      point_total: row.point_budget ?? null,
      source_character_id: row.id,
    };
  }
  return { statBlocks, playerCharacterIds: [...new Set(playerCharacterIds)] };
}

const DEFAULT_BIBLE: StoryBible = {
  logline: "",
  synopsis: "",
  themes: [],
  tone: "",
  genre: [],
  setting: "",
  timeline_summary: "",
};

export interface BuiltBundle {
  files: Record<string, Uint8Array>;
  manifest: AdaptationManifest;
  problems: string[];
}

/** Collects the manifest and every binary it references, without zipping yet. */
export async function buildAdaptationBundle(
  project: AdaptationProject,
  onProgress?: ExportProgress,
): Promise<BuiltBundle> {
  const bundle = new Bundle();
  const [campaign, facts, sceneRows, assetRows, entities, sources] = await Promise.all([
    getCampaign(project.campaign_id),
    listFacts(project.id),
    listScenes(project.id),
    listAdaptationAssets(project.id),
    listEntities(project.campaign_id),
    listAdaptationSources(project.id),
  ]);

  const total = assetRows.length + 4;
  let done = 0;
  const tick = (label: string) =>
    onProgress?.({ label, done: ++done, total, percent: Math.round((done / total) * 100) });

  tick("manifest");

  // ---- assets: download, fingerprint, dedupe by content hash
  const assetKeyByEntity = new Map<string, string[]>();
  const packed: AdaptationAsset[] = [];
  const seenHashes = new Map<string, string>();

  for (const row of assetRows) {
    if (!row.bucket || !row.storage_path || row.resolution_status === "rejected") {
      tick(`asset ${done}`);
      continue;
    }
    const bytes = await download(row.bucket, row.storage_path);
    if (!bytes) {
      tick(`asset ${done}`);
      continue;
    }
    const sha256 = await sha256Hex(bytes);
    let file = seenHashes.get(sha256);
    if (!file) {
      file = bundle.reserve(
        `assets/${row.role}`,
        row.storage_path.split("/").pop() ?? row.role,
        extensionOf(row.storage_path, "bin"),
      );
      bundle.add(file, bytes);
      seenHashes.set(sha256, file);
    }
    const assetKey = `asset:${sha256.slice(0, 32)}`;
    if (!packed.some((asset) => asset.asset_key === assetKey)) {
      const entity = entities.find((candidate) => candidate.id === row.canonical_entity_id);
      packed.push({
        asset_key: assetKey,
        file,
        media_type: row.media_type ?? "application/octet-stream",
        byte_size: bytes.byteLength,
        sha256,
        role: row.role,
        entity_id: row.canonical_entity_id,
        entity_name: entity?.name ?? null,
        is_canonical: row.is_canonical,
        caption: null,
      });
    }
    if (row.canonical_entity_id) {
      assetKeyByEntity.set(row.canonical_entity_id, [
        ...new Set([...(assetKeyByEntity.get(row.canonical_entity_id) ?? []), assetKey]),
      ]);
    }
    tick(`asset ${done}`);
  }

  const assets = dedupeByHash(packed);

  // ---- bibles
  const cast: BibleRecord[] = [];
  const locations: BibleRecord[] = [];
  const props: BibleRecord[] = [];
  for (const entity of entities) {
    const group = KIND_GROUP[entity.kind.toUpperCase()];
    if (!group) continue;
    const record = bibleRecord(entity, assetKeyByEntity.get(entity.id) ?? []);
    if (group === "cast") cast.push(record);
    else if (group === "locations") locations.push(record);
    else props.push(record);
  }
  tick("bibles");

  const storyBible: StoryBible = {
    ...DEFAULT_BIBLE,
    ...((project.creative_settings as { story_bible?: Partial<StoryBible> })?.story_bible ?? {}),
  };

  const { statBlocks, playerCharacterIds } = project.target_adventure_module
    ? await loadStatBlocks(entities)
    : { statBlocks: {}, playerCharacterIds: [] };

  const manifest = assembleManifest({
    statBlocks,
    playerCharacterIds,
    project,
    campaign: { id: campaign.id, name: campaign.name },
    facts: facts.map((fact) => ({
      stable_key: fact.stable_key,
      subject_entity_id: fact.subject_entity_id,
      subject_name: entities.find((e) => e.id === fact.subject_entity_id)?.name ?? null,
      fact_type: fact.fact_type,
      statement: fact.statement,
      provenance_type: fact.provenance_type,
      source_refs: fact.source_refs as AdaptationManifest["facts"][number]["source_refs"],
      confidence: fact.confidence,
      canon_status: fact.canon_status,
      conflict_with: fact.conflict_with ?? [],
      knowledge_state: undefined,
      gm_only: fact.gm_only,
    })),
    scenes: sceneRows.map((scene) => ({
      stable_key: scene.stable_key,
      sequence_no: scene.sequence_no,
      title: scene.title,
      synopsis: scene.synopsis,
      dramatic_goal: scene.dramatic_goal,
      story_beats: scene.story_beats as AdaptationScene["story_beats"],
      dialogue: scene.dialogue as AdaptationScene["dialogue"],
      narration: scene.narration as AdaptationScene["narration"],
      cast_entity_ids: scene.cast_entity_ids,
      location_entity_id: scene.location_entity_id,
      prop_entity_ids: scene.prop_entity_ids,
      wardrobe_refs: scene.wardrobe_refs as AdaptationScene["wardrobe_refs"],
      continuity_state: scene.continuity_state,
      knowledge_state: undefined,
      source_refs: scene.source_refs as AdaptationScene["source_refs"],
      provenance_type: scene.provenance_type,
      review_status: scene.review_status,
      content_hash: scene.content_hash,
      gm_only: scene.gm_only,
    })),
    assets,
    cast,
    locations,
    props,
    wardrobe: [],
    storyBible,
    sources: sources.map((source) => ({ ...source, source_id: source.source_id ?? null })),
    snapshotHash: sources.length ? sources[0]!.source_hash : "",
  });

  const problems = validateAdaptationManifest(manifest);
  const missing = referencedFiles(manifest).filter(
    (path) => !(path in (bundle.files as Record<string, Uint8Array>)),
  );
  if (missing.length) problems.push(`Missing files in the bundle: ${missing.join(", ")}`);

  bundle.add("adaptation.json", new TextEncoder().encode(JSON.stringify(manifest, null, 2)));
  bundle.add("README.md", new TextEncoder().encode(buildAdaptationReadme(manifest)));
  tick("packing");

  return { files: bundle.files as Record<string, Uint8Array>, manifest, problems };
}

function pack(files: Record<string, Uint8Array>): Uint8Array {
  const bytes = zipSync(files, { level: 6 });
  if (bytes.byteLength > MAX_ADAPTATION_BUNDLE_BYTES) {
    throw new Error("The adaptation is too large to export in one file.");
  }
  return bytes;
}

/** Complete adaptation bundle: manifest, README and every referenced binary. */
export async function exportAdaptationBundle(
  project: AdaptationProject,
  onProgress?: ExportProgress,
): Promise<{
  bytes: Uint8Array;
  fileName: string;
  manifest: AdaptationManifest;
  problems: string[];
}> {
  const built = await buildAdaptationBundle(project, onProgress);
  return {
    bytes: pack(built.files),
    fileName: `${slugify(project.name) || "adaptation"}-adaptation.zip`,
    manifest: built.manifest,
    problems: built.problems,
  };
}

/** Exports only one target projection, for handing straight to RX or MovieSmith. */
export async function exportProjectionBundle(
  project: AdaptationProject,
  target: AdaptationTarget,
  onProgress?: ExportProgress,
): Promise<{ bytes: Uint8Array; fileName: string }> {
  const built = await buildAdaptationBundle(project, onProgress);
  const projection = built.manifest.targets[target];
  if (!projection) throw new Error("This adaptation has no projection for that target.");

  const used = new Set(built.manifest.assets.map((asset) => asset.file));
  const files: Record<string, Uint8Array> = {
    [`${target}.json`]: new TextEncoder().encode(JSON.stringify(projection, null, 2)),
    "assets.json": new TextEncoder().encode(JSON.stringify(built.manifest.assets, null, 2)),
  };
  // Books also ship a readable draft next to the structured projection.
  const book = built.manifest.targets.book_narrative;
  const adventure = built.manifest.targets.adventure_module;
  if (target === "book_narrative" && book)
    files["book.md"] = new TextEncoder().encode(renderBookMarkdown(book));
  if (target === "adventure_module" && adventure)
    files["module.md"] = new TextEncoder().encode(renderAdventureModuleMarkdown(adventure));
  for (const [path, bytes] of Object.entries(built.files)) {
    if (used.has(path)) files[path] = bytes;
  }

  return {
    bytes: pack(files),
    fileName: `${slugify(project.name) || "adaptation"}-${target}.zip`,
  };
}
