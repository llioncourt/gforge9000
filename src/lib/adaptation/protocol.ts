import { z } from "zod";

import {
  ASSET_ROLES,
  CANON_STATUSES,
  PROVENANCE_TYPES,
  SOURCE_MODES,
  SPOILER_POLICIES,
} from "@/lib/adaptation/types";

/**
 * AWD Campaign Adaptation package — `awd-campaign-adaptation` version 1.
 *
 * A ZIP with `adaptation.json` at its root plus the binary files it references.
 * This is a DERIVED artifact: it never replaces the UCF campaign package, and
 * every fact and scene keeps `source_refs` pointing back at the campaign
 * records it came from.
 *
 * Everything in this module is data-only, so the format can be validated and
 * unit tested without touching the database or storage.
 */

export const ADAPTATION_FORMAT = "awd-campaign-adaptation" as const;
export const ADAPTATION_VERSION = 1 as const;
export const MAX_ADAPTATION_BUNDLE_BYTES = 750 * 1024 * 1024;

const text = (max: number) => z.string().max(max);
const nullableText = (max: number) => text(max).nullish();
const filePath = z
  .string()
  .trim()
  .min(1)
  .max(300)
  // No absolute paths, no traversal, no Windows drive letters, no backslashes.
  .regex(/^(?!\/)(?!.*\\)(?!.*(^|\/)\.\.(\/|$))(?![A-Za-z]:)[\w./-]+$/, "unsafe file path");

export const sourceRefSchema = z
  .object({
    source_type: text(60),
    source_key: text(200),
    source_id: nullableText(64),
    label: nullableText(300),
    excerpt: nullableText(2000),
  })
  .strict();

const knowledgeStateSchema = z
  .object({
    world_truth: z.boolean().default(true),
    gm_knowledge: z.boolean().default(true),
    player_knowledge: text(40).default("unknown"),
    character_knowledge: text(40).default("unknown"),
    revealed: z.boolean().default(false),
    revealed_to: z.array(text(64)).max(200).default([]),
    witnessed_by: z.array(text(64)).max(200).default([]),
  })
  .strict();

export const adaptationFactSchema = z
  .object({
    stable_key: text(200),
    subject_entity_id: nullableText(64),
    subject_name: nullableText(200),
    fact_type: text(60).default("general"),
    statement: text(4000),
    provenance_type: z.enum(PROVENANCE_TYPES),
    source_refs: z.array(sourceRefSchema).max(200).default([]),
    confidence: z.number().min(0).max(1).default(0.5),
    canon_status: z.enum(CANON_STATUSES).default("needs_review"),
    conflict_with: z.array(text(200)).max(100).default([]),
    knowledge_state: knowledgeStateSchema.optional(),
    gm_only: z.boolean().default(true),
  })
  .strict();

const beatSchema = z
  .object({
    order: z.number().int().min(0),
    description: text(2000),
    emotion: nullableText(60),
    entity_ids: z.array(text(64)).max(50).default([]),
  })
  .strict();

const dialogueSchema = z
  .object({
    order: z.number().int().min(0),
    speaker: text(200),
    speaker_entity_id: nullableText(64),
    line: text(4000),
    delivery: nullableText(200),
    /** balloon | caption | thought | off_panel — the comic adapter maps these. */
    balloon_type: text(40).default("balloon"),
  })
  .strict();

const narrationSchema = z
  .object({
    order: z.number().int().min(0),
    text: text(4000),
    placement: text(40).default("caption"),
  })
  .strict();

export const adaptationSceneSchema = z
  .object({
    stable_key: text(200),
    sequence_no: z.number().int().min(0),
    title: text(300),
    synopsis: text(8000).default(""),
    dramatic_goal: text(2000).default(""),
    story_beats: z.array(beatSchema).max(200).default([]),
    dialogue: z.array(dialogueSchema).max(500).default([]),
    narration: z.array(narrationSchema).max(200).default([]),
    cast_entity_ids: z.array(text(64)).max(100).default([]),
    location_entity_id: nullableText(64),
    prop_entity_ids: z.array(text(64)).max(100).default([]),
    wardrobe_refs: z
      .array(
        z
          .object({
            entity_id: nullableText(64),
            character_name: text(200),
            description: text(2000),
            asset_key: nullableText(200),
          })
          .strict(),
      )
      .max(200)
      .default([]),
    continuity_state: z.record(z.string(), z.unknown()).default({}),
    knowledge_state: knowledgeStateSchema.optional(),
    source_refs: z.array(sourceRefSchema).max(200).default([]),
    provenance_type: z.enum(PROVENANCE_TYPES).default("ai_inference"),
    review_status: z.enum(CANON_STATUSES).default("needs_review"),
    content_hash: text(64).default(""),
    gm_only: z.boolean().default(true),
  })
  .strict();

export const adaptationAssetSchema = z
  .object({
    asset_key: text(200),
    file: filePath,
    media_type: text(120),
    byte_size: z.number().int().min(0),
    sha256: text(64),
    role: z.enum(ASSET_ROLES),
    entity_id: nullableText(64),
    entity_name: nullableText(200),
    is_canonical: z.boolean().default(false),
    caption: nullableText(2000),
  })
  .strict();

const bibleRecordSchema = z
  .object({
    entity_id: nullableText(64),
    key: text(200),
    name: text(200),
    kind: text(60),
    biography: text(20000).default(""),
    visual_description: text(8000).default(""),
    traits: z.array(text(200)).max(100).default([]),
    asset_keys: z.array(text(200)).max(50).default([]),
    source_refs: z.array(sourceRefSchema).max(100).default([]),
    gm_only: z.boolean().default(false),
  })
  .strict();

const storyBibleSchema = z
  .object({
    logline: text(2000).default(""),
    synopsis: text(20000).default(""),
    themes: z.array(text(200)).max(50).default([]),
    tone: text(500).default(""),
    genre: z.array(text(80)).max(20).default([]),
    setting: text(8000).default(""),
    timeline_summary: text(20000).default(""),
  })
  .strict();

/** Comic projection — semantically compatible with rx-comics-v2-manifest/1.0. */
const comicPanelSchema = z
  .object({
    panel_no: z.number().int().min(1),
    shot: text(60).default("medium"),
    description: text(4000),
    characters: z.array(text(200)).max(50).default([]),
    location: nullableText(200),
    props: z.array(text(200)).max(50).default([]),
    wardrobe: z.array(text(400)).max(50).default([]),
    emotions: z.array(text(120)).max(50).default([]),
    dialogue: z
      .array(
        z
          .object({
            speaker: text(200),
            text: text(2000),
            balloon_type: text(40).default("balloon"),
          })
          .strict(),
      )
      .max(50)
      .default([]),
    captions: z.array(text(2000)).max(20).default([]),
    sfx: z.array(text(120)).max(30).default([]),
    visual_direction: text(4000).default(""),
    asset_keys: z.array(text(200)).max(50).default([]),
  })
  .strict();

const comicPageSchema = z
  .object({
    page_no: z.number().int().min(1),
    scene_keys: z.array(text(200)).max(20).default([]),
    layout_hint: text(120).default("grid"),
    panels: z.array(comicPanelSchema).max(24).default([]),
  })
  .strict();

export const comicProjectionSchema = z
  .object({
    target_system: z.literal("rx_comics"),
    /** Semantic payload the RX adapter validates against its own catalogs. */
    target_projection: z
      .object({
        manifest_kind: z.literal("rx-comics-v2-manifest"),
        manifest_version: z.literal("1.0"),
        series: z
          .object({
            title: text(300),
            subtitle: nullableText(300),
            synopsis: text(20000).default(""),
            genre: z.array(text(80)).max(20).default([]),
            art_direction: text(8000).default(""),
          })
          .strict(),
        issue: z
          .object({
            number: z.number().int().min(1).default(1),
            title: text(300),
            synopsis: text(20000).default(""),
            page_target: z.number().int().min(1).max(400).nullish(),
            density: text(40).default("standard"),
          })
          .strict(),
        characters: z.array(bibleRecordSchema).max(500).default([]),
        locations: z.array(bibleRecordSchema).max(500).default([]),
        props: z.array(bibleRecordSchema).max(500).default([]),
        wardrobe: z.array(bibleRecordSchema).max(500).default([]),
        pages: z.array(comicPageSchema).max(400).default([]),
        continuity: z.record(z.string(), z.unknown()).default({}),
        loadout_hints: z.record(z.string(), z.unknown()).default({}),
      })
      .strict(),
  })
  .strict();

/** Movie projection — `moviesmith.movie.v1`, decomposable into pack v2 per scene. */
const movieSceneSchema = z
  .object({
    scene_key: text(200),
    scene_no: z.number().int().min(1),
    slugline: text(300),
    synopsis: text(8000).default(""),
    location: nullableText(200),
    time_of_day: text(60).default("DAY"),
    cast: z.array(text(200)).max(100).default([]),
    props: z.array(text(200)).max(100).default([]),
    wardrobe: z.array(text(400)).max(100).default([]),
    continuity: z.record(z.string(), z.unknown()).default({}),
    /** Everything a moviesmith.pack.v2 needs to be materialised for this scene. */
    pack_seed: z
      .object({
        format: z.literal("moviesmith.pack.v2"),
        cuts: z
          .array(
            z
              .object({
                cut_no: z.number().int().min(1),
                shot: text(60).default("medium"),
                duration_seconds: z.number().min(0.2).max(600).default(4),
                description: text(4000),
                camera: text(500).default(""),
                actions: z
                  .array(
                    z
                      .object({
                        actor: text(200),
                        action: text(2000),
                      })
                      .strict(),
                  )
                  .max(50)
                  .default([]),
                tts: z
                  .array(
                    z
                      .object({
                        speaker: text(200),
                        line: text(4000),
                        voice_hint: nullableText(200),
                        emotion: nullableText(120),
                        lipsync: z.boolean().default(true),
                      })
                      .strict(),
                  )
                  .max(50)
                  .default([]),
                sfx: z.array(text(200)).max(30).default([]),
                music: nullableText(200),
              })
              .strict(),
          )
          .max(200)
          .default([]),
      })
      .strict(),
  })
  .strict();

export const movieProjectionSchema = z
  .object({
    target_system: z.literal("moviesmith"),
    target_projection: z
      .object({
        format: z.literal("moviesmith.movie.v1"),
        movie: z
          .object({
            title: text(300),
            logline: text(2000).default(""),
            synopsis: text(20000).default(""),
            runtime_target_minutes: z.number().int().min(1).max(600).nullish(),
            aspect_ratio: text(20).default("16:9"),
            language: text(20).default("en"),
          })
          .strict(),
        story_bible: storyBibleSchema,
        cast: z.array(bibleRecordSchema).max(500).default([]),
        locations: z.array(bibleRecordSchema).max(500).default([]),
        props: z.array(bibleRecordSchema).max(500).default([]),
        wardrobe: z.array(bibleRecordSchema).max(500).default([]),
        style: z.record(z.string(), z.unknown()).default({}),
        scenes: z.array(movieSceneSchema).max(500).default([]),
      })
      .strict(),
  })
  .strict();

const syncManifestSchema = z
  .object({
    sources: z
      .array(
        z
          .object({
            source_key: text(200),
            source_type: text(60),
            source_id: nullableText(64),
            source_hash: text(64),
            label: text(300).default(""),
          })
          .strict(),
      )
      .max(20000)
      .default([]),
    scene_hashes: z.record(z.string(), z.string()).default({}),
    target_mapping_hints: z.record(z.string(), z.unknown()).default({}),
    snapshot_hash: text(64).default(""),
  })
  .strict();

export const adaptationManifestSchema = z
  .object({
    format: z.literal(ADAPTATION_FORMAT),
    version: z.literal(ADAPTATION_VERSION),
    exported_at: text(40),
    source_campaign: z
      .object({
        campaign_id: text(64),
        name: text(200),
        revision: text(64).default(""),
        ucf_package_format: text(60).default("ucf-campaign-package"),
        ucf_package_version: z.number().int().default(1),
      })
      .strict(),
    adaptation: z
      .object({
        id: text(64),
        name: text(200),
        source_mode: z.enum(SOURCE_MODES),
        spoiler_policy: z.enum(SPOILER_POLICIES),
        source_scope: z.record(z.string(), z.unknown()).default({}),
        creative_settings: z.record(z.string(), z.unknown()).default({}),
      })
      .strict(),
    story_bible: storyBibleSchema,
    facts: z.array(adaptationFactSchema).max(20000).default([]),
    conflicts: z
      .array(
        z
          .object({
            stable_key: text(200),
            statement: text(4000),
            conflicting_keys: z.array(text(200)).max(100).default([]),
            source_refs: z.array(sourceRefSchema).max(100).default([]),
          })
          .strict(),
      )
      .max(5000)
      .default([]),
    cast: z.array(bibleRecordSchema).max(1000).default([]),
    locations: z.array(bibleRecordSchema).max(1000).default([]),
    props: z.array(bibleRecordSchema).max(1000).default([]),
    wardrobe: z.array(bibleRecordSchema).max(1000).default([]),
    scenes: z.array(adaptationSceneSchema).max(2000).default([]),
    assets: z.array(adaptationAssetSchema).max(5000).default([]),
    targets: z
      .object({
        comic: comicProjectionSchema.nullish(),
        movie: movieProjectionSchema.nullish(),
      })
      .strict()
      .default({}),
    sync: syncManifestSchema,
  })
  .strict();

export type AdaptationManifest = z.infer<typeof adaptationManifestSchema>;
export type AdaptationFact = z.infer<typeof adaptationFactSchema>;
export type AdaptationScene = z.infer<typeof adaptationSceneSchema>;
export type AdaptationAsset = z.infer<typeof adaptationAssetSchema>;
export type BibleRecord = z.infer<typeof bibleRecordSchema>;
export type ComicProjection = z.infer<typeof comicProjectionSchema>;
export type MovieProjection = z.infer<typeof movieProjectionSchema>;
export type StoryBible = z.infer<typeof storyBibleSchema>;

/** Parses and validates `adaptation.json`, with readable errors. */
export function parseAdaptationManifest(raw: string): AdaptationManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("adaptation.json is not valid JSON.");
  }
  const parsed = adaptationManifestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? issue.path.join(".") : "adaptation.json";
    throw new Error(`${where}: ${issue?.message ?? "invalid adaptation package."}`);
  }
  return parsed.data;
}

/** Cross-reference checks that zod cannot express on its own. */
export function validateAdaptationManifest(manifest: AdaptationManifest): string[] {
  const problems: string[] = [];
  const assetKeys = new Set(manifest.assets.map((a) => a.asset_key));
  const sceneKeys = new Set(manifest.scenes.map((s) => s.stable_key));
  const factKeys = new Set(manifest.facts.map((f) => f.stable_key));

  if (assetKeys.size !== manifest.assets.length) problems.push("Duplicate asset keys.");
  if (sceneKeys.size !== manifest.scenes.length) problems.push("Duplicate scene keys.");
  if (factKeys.size !== manifest.facts.length) problems.push("Duplicate fact keys.");

  const bySha = new Map<string, string>();
  for (const asset of manifest.assets) {
    const seen = bySha.get(asset.sha256);
    if (seen && seen !== asset.file) {
      problems.push(`Assets "${seen}" and "${asset.file}" duplicate the same file content.`);
    }
    bySha.set(asset.sha256, asset.file);
  }

  const sequences = manifest.scenes.map((s) => s.sequence_no);
  if (new Set(sequences).size !== sequences.length) problems.push("Duplicate scene sequence numbers.");

  for (const fact of manifest.facts) {
    for (const key of fact.conflict_with) {
      if (!factKeys.has(key)) problems.push(`Fact "${fact.stable_key}" conflicts with unknown "${key}".`);
    }
    if (fact.provenance_type !== "adaptation_created" && fact.source_refs.length === 0) {
      problems.push(`Fact "${fact.stable_key}" has no source reference.`);
    }
  }

  for (const scene of manifest.scenes) {
    for (const ref of scene.wardrobe_refs) {
      if (ref.asset_key && !assetKeys.has(ref.asset_key)) {
        problems.push(`Scene "${scene.stable_key}" uses unknown asset "${ref.asset_key}".`);
      }
    }
  }

  for (const record of [...manifest.cast, ...manifest.locations, ...manifest.props, ...manifest.wardrobe]) {
    for (const key of record.asset_keys) {
      if (!assetKeys.has(key)) problems.push(`"${record.name}" references unknown asset "${key}".`);
    }
  }

  const comic = manifest.targets.comic;
  if (comic) {
    const pages = comic.target_projection.pages.map((p) => p.page_no);
    if (new Set(pages).size !== pages.length) problems.push("Duplicate comic page numbers.");
    for (const page of comic.target_projection.pages) {
      for (const key of page.scene_keys) {
        if (!sceneKeys.has(key)) problems.push(`Comic page ${page.page_no} references unknown scene "${key}".`);
      }
    }
  }

  const movie = manifest.targets.movie;
  if (movie) {
    for (const scene of movie.target_projection.scenes) {
      if (!sceneKeys.has(scene.scene_key)) {
        problems.push(`Movie scene ${scene.scene_no} references unknown scene "${scene.scene_key}".`);
      }
    }
  }

  return problems;
}

/** Every ZIP path the manifest expects to find, for a pre-flight check. */
export function referencedFiles(manifest: AdaptationManifest): string[] {
  return [...new Set(manifest.assets.map((asset) => asset.file))];
}

/** True when the path is safe to write inside a bundle. */
export function isSafeBundlePath(path: string): boolean {
  return filePath.safeParse(path).success;
}
