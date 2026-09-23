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

/* ------------------------------------------------------------------ books */

const provenanceField = z.enum(PROVENANCE_TYPES);
const refs = (max: number) => z.array(sourceRefSchema).max(max).default([]);

const bookParagraphSchema = z
  .object({
    kind: z.enum(["narration", "action", "dialogue", "transition"]),
    text: text(8000),
    speaker: nullableText(200),
    delivery: nullableText(200),
    provenance_type: provenanceField,
    /** Transitions carry a brief instead of prose until an author writes them. */
    writing_brief: nullableText(2000),
  })
  .strict();

const bookSectionSchema = z
  .object({
    section_no: z.number().int().min(1),
    kind: z.enum(["scene", "transition"]),
    scene_key: nullableText(200),
    heading: nullableText(300),
    location: nullableText(200),
    characters: z.array(text(200)).max(100).default([]),
    paragraphs: z.array(bookParagraphSchema).max(2000).default([]),
    provenance_type: provenanceField,
    review_status: z.enum(CANON_STATUSES).default("needs_review"),
    source_refs: refs(200),
  })
  .strict();

const bookChapterSchema = z
  .object({
    chapter_no: z.number().int().min(1),
    key: text(200),
    title: text(300),
    summary: text(8000).default(""),
    pov_character: nullableText(200),
    scene_keys: z.array(text(200)).max(200).default([]),
    word_target: z.number().int().min(0).nullish(),
    source_word_count: z.number().int().min(0).default(0),
    sections: z.array(bookSectionSchema).max(400).default([]),
    source_refs: refs(400),
  })
  .strict();

export const BOOK_LENGTH_MODES = ["auto", "short_story", "novella", "novel"] as const;
export type BookLengthMode = (typeof BOOK_LENGTH_MODES)[number];

/** Narrative book — a literary novelization, not a play report. */
export const bookNarrativeProjectionSchema = z
  .object({
    target_system: z.literal("book"),
    target_projection: z
      .object({
        format: z.literal("awd.book.narrative.v1"),
        front_matter: z
          .object({
            title: text(300),
            subtitle: nullableText(300),
            language: text(20).default("en"),
            logline: text(2000).default(""),
            synopsis: text(20000).default(""),
            tone: text(500).default(""),
            pov: text(500).default(""),
            audience: text(500).default(""),
          })
          .strict(),
        structure: z
          .object({
            length_mode: z.enum(BOOK_LENGTH_MODES),
            resolved_form: z.enum(["short_story", "novella", "novel"]),
            chapter_count: z.number().int().min(1),
            chapter_target: z.number().int().min(1).nullish(),
            word_target: z.number().int().min(1).nullish(),
            source_word_count: z.number().int().min(0),
            /** Why the automatic mode picked this structure, as machine-readable reason codes. */
            reasons: z.array(text(120)).max(20).default([]),
          })
          .strict(),
        chapters: z.array(bookChapterSchema).max(400).default([]),
        dramatis_personae: z
          .array(
            z
              .object({
                name: text(200),
                entity_id: nullableText(64),
                description: text(4000).default(""),
                chapters: z.array(z.number().int().min(1)).max(400).default([]),
              })
              .strict(),
          )
          .max(500)
          .default([]),
        locations: z.array(bibleRecordSchema).max(500).default([]),
        adaptation_notes: z
          .object({
            canon_preserved: z.literal(true),
            reconstructed_dialogue_lines: z.number().int().min(0),
            adaptation_created_sections: z.number().int().min(0),
            unreviewed_sections: z.number().int().min(0),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

/* ------------------------------------------------------- adventure module */

export const MODULE_APPROACHES = [
  "social",
  "stealth",
  "force",
  "investigation",
  "evasion",
] as const;

const gurpsStatBlockSchema = z
  .object({
    st: z.number(),
    dx: z.number(),
    iq: z.number(),
    ht: z.number(),
    hp: z.number(),
    will: z.number(),
    per: z.number(),
    fp: z.number(),
    basic_speed: z.number(),
    basic_move: z.number(),
    dodge: z.number(),
    point_total: z.number().nullish(),
    source_character_id: nullableText(64),
  })
  .strict();

const moduleNpcSchema = z
  .object({
    key: text(200),
    entity_id: nullableText(64),
    name: text(200),
    role: z.enum(["antagonist", "ally", "neutral", "player_character"]),
    player_description: text(8000).default(""),
    gm_notes: text(20000).default(""),
    gurps: gurpsStatBlockSchema.nullish(),
    encounter_keys: z.array(text(200)).max(200).default([]),
    asset_keys: z.array(text(200)).max(50).default([]),
    source_refs: refs(100),
  })
  .strict();

const moduleRouteSchema = z
  .object({
    key: text(200),
    approach: z.enum([...MODULE_APPROACHES, "original_table"]),
    description: text(4000),
    /** The route taken at the original table is recorded, never mandatory. */
    original_table: z.boolean().default(false),
    suggested_skills: z.array(text(120)).max(20).default([]),
    /** Null means the GM sets the modifier for the situation. */
    modifier: z.number().int().min(-10).max(10).nullish(),
    leads_to: z.array(text(200)).max(20).default([]),
    provenance_type: provenanceField,
    review_status: z.enum(CANON_STATUSES).default("needs_review"),
  })
  .strict();

const moduleEncounterSchema = z
  .object({
    key: text(200),
    scene_key: text(200),
    act_no: z.number().int().min(1),
    title: text(300),
    gm_summary: text(8000).default(""),
    /** Player-safe framing the GM can read or paraphrase at the table. */
    player_framing: text(8000).default(""),
    objective: text(2000).default(""),
    location: nullableText(200),
    npcs: z.array(text(200)).max(100).default([]),
    clue_keys: z.array(text(200)).max(100).default([]),
    routes: z.array(moduleRouteSchema).max(20).default([]),
    outcomes: z
      .array(
        z
          .object({
            condition: z.enum(["success", "partial", "failure", "skipped"]),
            consequence: text(2000),
            provenance_type: provenanceField,
          })
          .strict(),
      )
      .max(10)
      .default([]),
    hazards: z.array(text(500)).max(20).default([]),
    handout_asset_keys: z.array(text(200)).max(50).default([]),
    gm_only: z.boolean().default(true),
    source_refs: refs(200),
  })
  .strict();

const moduleClueSchema = z
  .object({
    key: text(200),
    statement: text(4000),
    fact_key: nullableText(200),
    /** What the GM holds, what characters can uncover, and what players may simply be shown. */
    audience: z.enum(["gm_only", "discoverable", "player_facing"]),
    points_to: z.array(text(200)).max(50).default([]),
    found_in: z.array(text(200)).max(50).default([]),
    reveal_conditions: z.array(text(500)).max(20).default([]),
    if_missed: text(2000).default(""),
    revealed_in_original: z.boolean().default(false),
    provenance_type: provenanceField,
    source_refs: refs(100),
  })
  .strict();

export const adventureModuleProjectionSchema = z
  .object({
    target_system: z.literal("gurps"),
    target_projection: z
      .object({
        format: z.literal("awd.adventure-module.gurps.v1"),
        game_system: z.literal("gurps_4e"),
        adaptation_level: z.literal("complete_module"),
        front_matter: z
          .object({
            title: text(300),
            subtitle: nullableText(300),
            language: text(20).default("en"),
            players_min: z.number().int().min(1).max(20),
            players_max: z.number().int().min(1).max(20),
            starting_points: z.number().int().min(0).max(10000).nullish(),
            tech_level: z.number().int().min(0).max(12).nullish(),
          })
          .strict(),
        introduction: z
          .object({ gm_summary: text(20000).default(""), player_pitch: text(8000).default("") })
          .strict(),
        overview: z
          .object({
            premise: text(8000).default(""),
            themes: z.array(text(200)).max(50).default([]),
            tone: text(500).default(""),
            act_count: z.number().int().min(0),
            encounter_count: z.number().int().min(0),
          })
          .strict(),
        background: z
          .object({ gm_truth: text(20000).default(""), common_knowledge: text(20000).default("") })
          .strict(),
        hooks: z
          .array(
            z
              .object({
                key: text(200),
                text: text(2000),
                provenance_type: provenanceField,
                source_refs: refs(50),
              })
              .strict(),
          )
          .max(50)
          .default([]),
        npcs: z.array(moduleNpcSchema).max(500).default([]),
        antagonist_keys: z.array(text(200)).max(200).default([]),
        locations: z
          .array(
            z
              .object({
                key: text(200),
                entity_id: nullableText(64),
                name: text(200),
                player_description: text(8000).default(""),
                gm_notes: text(20000).default(""),
                map_asset_keys: z.array(text(200)).max(50).default([]),
                encounter_keys: z.array(text(200)).max(200).default([]),
                source_refs: refs(100),
              })
              .strict(),
          )
          .max(500)
          .default([]),
        chronology: z
          .object({
            initial_situation: text(8000).default(""),
            events: z
              .array(
                z
                  .object({
                    order: z.number().int().min(1),
                    scene_key: text(200),
                    summary: text(4000),
                  })
                  .strict(),
              )
              .max(2000)
              .default([]),
          })
          .strict(),
        getting_started: z
          .object({
            opening_encounter_key: nullableText(200),
            player_framing: text(8000).default(""),
          })
          .strict(),
        acts: z
          .array(
            z
              .object({
                act_no: z.number().int().min(1),
                title: text(300),
                summary: text(8000).default(""),
                encounter_keys: z.array(text(200)).max(200).default([]),
              })
              .strict(),
          )
          .max(50)
          .default([]),
        encounters: z.array(moduleEncounterSchema).max(2000).default([]),
        clues: z.array(moduleClueSchema).max(5000).default([]),
        revelations: z
          .array(
            z
              .object({
                key: text(200),
                statement: text(4000),
                clue_keys: z.array(text(200)).max(50).default([]),
                revealed_in_original: z.boolean().default(false),
                source_refs: refs(100),
              })
              .strict(),
          )
          .max(2000)
          .default([]),
        handouts: z
          .array(
            z
              .object({
                asset_key: text(200),
                role: z.enum(ASSET_ROLES),
                title: text(300),
                player_safe: z.boolean(),
              })
              .strict(),
          )
          .max(1000)
          .default([]),
        appendices: z
          .object({
            fact_index: z
              .array(
                z
                  .object({
                    key: text(200),
                    statement: text(4000),
                    provenance_type: provenanceField,
                    gm_only: z.boolean(),
                  })
                  .strict(),
              )
              .max(20000)
              .default([]),
          })
          .strict(),
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
        // Added without a version bump: older v1 packages simply omit them.
        book_narrative: bookNarrativeProjectionSchema.nullish(),
        adventure_module: adventureModuleProjectionSchema.nullish(),
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
export type BookNarrativeProjection = z.infer<typeof bookNarrativeProjectionSchema>;
export type AdventureModuleProjection = z.infer<typeof adventureModuleProjectionSchema>;

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
  if (new Set(sequences).size !== sequences.length)
    problems.push("Duplicate scene sequence numbers.");

  for (const fact of manifest.facts) {
    for (const key of fact.conflict_with) {
      if (!factKeys.has(key))
        problems.push(`Fact "${fact.stable_key}" conflicts with unknown "${key}".`);
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

  for (const record of [
    ...manifest.cast,
    ...manifest.locations,
    ...manifest.props,
    ...manifest.wardrobe,
  ]) {
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
        if (!sceneKeys.has(key))
          problems.push(`Comic page ${page.page_no} references unknown scene "${key}".`);
      }
    }
  }

  const movie = manifest.targets.movie;
  if (movie) {
    for (const scene of movie.target_projection.scenes) {
      if (!sceneKeys.has(scene.scene_key)) {
        problems.push(
          `Movie scene ${scene.scene_no} references unknown scene "${scene.scene_key}".`,
        );
      }
    }
  }

  const book = manifest.targets.book_narrative;
  if (book) {
    const numbers = book.target_projection.chapters.map((c) => c.chapter_no);
    if (new Set(numbers).size !== numbers.length) problems.push("Duplicate book chapter numbers.");
    for (const chapter of book.target_projection.chapters) {
      for (const key of chapter.scene_keys) {
        if (!sceneKeys.has(key))
          problems.push(`Book chapter ${chapter.chapter_no} references unknown scene "${key}".`);
      }
    }
  }

  const adventure = manifest.targets.adventure_module;
  if (adventure) {
    const module = adventure.target_projection;
    const encounterKeys = new Set(module.encounters.map((e) => e.key));
    const clueKeys = new Set(module.clues.map((c) => c.key));
    for (const encounter of module.encounters) {
      if (!sceneKeys.has(encounter.scene_key))
        problems.push(
          `Encounter "${encounter.key}" references unknown scene "${encounter.scene_key}".`,
        );
      for (const key of encounter.clue_keys)
        if (!clueKeys.has(key))
          problems.push(`Encounter "${encounter.key}" uses unknown clue "${key}".`);
      for (const route of encounter.routes)
        for (const next of route.leads_to)
          if (!encounterKeys.has(next))
            problems.push(`Route "${route.key}" leads to unknown encounter "${next}".`);
      if (encounter.routes.length && encounter.routes.every((route) => route.original_table))
        problems.push(`Encounter "${encounter.key}" offers only the original table's solution.`);
    }
    for (const act of module.acts)
      for (const key of act.encounter_keys)
        if (!encounterKeys.has(key))
          problems.push(`Act ${act.act_no} lists unknown encounter "${key}".`);
    for (const handout of module.handouts)
      if (!assetKeys.has(handout.asset_key))
        problems.push(`Handout references unknown asset "${handout.asset_key}".`);
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
