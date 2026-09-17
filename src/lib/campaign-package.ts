import { z } from "zod";

/**
 * Campaign package (UCF-CAMPAIGN v1) — pure schema + helpers.
 *
 * A campaign package is a ZIP with `campaign.json` at its root plus the binary
 * files it references. Everything here is data-only: no IO, so the format can
 * be unit tested and documented independently of the importer.
 */

const text = (max: number) => z.string().trim().max(max);
const nullableText = (max: number) => text(max).nullish();
const filePath = z.string().trim().min(1).max(300);

export const MAX_CAMPAIGN_PACKAGE_BYTES = 500 * 1024 * 1024;

export const NOTE_KINDS = ["note", "handout", "session", "session-prep", "rule"] as const;
export const VISIBILITIES = ["gm", "players", "public"] as const;
export const GRID_TYPES = ["square", "hex", "none"] as const;

/**
 * Visibility is a closed set. Older files (and files written by hand) use other
 * spellings, so anything recognisable is mapped onto the canonical word first
 * and only then validated; anything unrecognised is refused rather than stored.
 */
const PACKAGE_VISIBILITY_ALIASES: Record<string, (typeof VISIBILITIES)[number]> = {
  gm: "gm",
  gm_only: "gm",
  gmonly: "gm",
  private: "gm",
  secret: "gm",
  hidden: "gm",
  unrevealed: "gm",
  selected_players: "gm",
  players: "players",
  all_players: "players",
  shared: "players",
  campaign: "players",
  public: "public",
};

const visibilityField = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return PACKAGE_VISIBILITY_ALIASES[key] ?? value;
}, z.enum(VISIBILITIES).default("gm"));

const settingsSchema = z
  .object({
    point_limit: z.number().int().min(0).max(100000).optional(),
    disadvantage_limit: z.number().int().min(-100000).max(0).optional(),
    tech_level: z.number().int().min(0).max(20).optional(),
    house_rules: text(20000).optional(),
    allowed_sources: z.array(text(80)).max(50).optional(),
    allowed_packs: z.array(text(120)).max(200).optional(),

  })
  .strict();

const noteSchema = z
  .object({
    kind: z.enum(NOTE_KINDS).default("note"),
    title: text(200).min(1),
    body: text(100000).default(""),
    gm_only: z.boolean().default(false),
  })
  .strict();

const entitySchema = z
  .object({
    key: text(160).min(1),
    kind: text(60).min(1),
    name: text(200).min(1),
    status: text(60).default("active"),
    visibility: visibilityField,
    summary: nullableText(2000),
    description: nullableText(50000),
    player_description: nullableText(50000),
    gm_notes: nullableText(50000),
    aliases: z.array(text(120)).max(50).default([]),
    tags: z.array(text(60)).max(50).default([]),
    sort_order: z.number().int().min(0).max(100000).default(0),
    parent_key: text(160).nullish(),
    /** Optional image inside the ZIP; converted to AVIF on import. */
    image_file: filePath.nullish(),
    /** Links this entity (usually an NPC) to a character sheet in the package. */
    character_key: text(160).nullish(),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

const relationshipSchema = z
  .object({
    source_key: text(160).min(1),
    target_key: text(160).min(1),
    rel_type: text(60).min(1),
    description: nullableText(4000),
    gm_description: nullableText(4000),
    start_label: nullableText(120),
    end_label: nullableText(120),
    strength: z.number().int().min(-5).max(5).nullish(),
    is_current: z.boolean().default(true),
    visibility: visibilityField,
  })
  .strict();

const assetSchema = z
  .object({
    title: text(200).min(1),
    caption: nullableText(2000),
    tags: z.array(text(60)).max(50).default([]),
    visible_to_players: z.boolean().default(false),
    file: filePath,
  })
  .strict();

const mapObjectSchema = z
  .object({
    kind: text(40).default("token"),
    label: text(120).min(1),
    x: z.number().default(0),
    y: z.number().default(0),
    size: z.number().min(0.25).max(20).default(1),
    rotation: z.number().min(-360).max(360).default(0),
    color: nullableText(40),
    hidden: z.boolean().default(false),
    image_file: filePath.nullish(),
    /** Token art / sheet link resolved from an entity or character key. */
    entity_key: text(160).nullish(),
    character_key: text(160).nullish(),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

const mapSchema = z
  .object({
    name: text(160).min(1),
    file: filePath.nullish(),
    grid_type: z.enum(GRID_TYPES).default("hex"),
    grid_size: z.number().min(4).max(1000).default(64),
    grid_offset_x: z.number().default(0),
    grid_offset_y: z.number().default(0),
    unit_per_cell: z.number().min(0.01).max(10000).default(1),
    unit_name: text(20).default("yd"),
    is_active: z.boolean().default(false),
    visible_to_players: z.boolean().default(false),
    objects: z.array(mapObjectSchema).max(500).default([]),
  })
  .strict();

// Mirrors the standalone soundtrack pack format, so an album keeps its
// grouping, publish state and lyrics when it travels inside a campaign ZIP.
const soundtrackTrackSchema = z
  .object({
    position: z.number().int().min(1).max(60),
    title: text(200).min(1),
    composer: nullableText(160),
    duration_seconds: z.number().int().min(1).max(3600).nullish(),
    file: filePath,
    lyrics: nullableText(20000),
  })
  .strict();

const soundtrackSchema = z
  .object({
    slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/),
    title: text(160).min(2),
    subtitle: nullableText(200),
    description: nullableText(4000),
    composer: nullableText(160),
    release_year: z.number().int().min(1970).max(2100).nullish(),
    game_slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).nullish(),
    status: z.enum(["draft", "published"]).optional(),
    cover: filePath,
    tracks: z.array(soundtrackTrackSchema).min(1).max(60),
  })
  .strict();

const characterSchema = z
  .object({
    key: text(160).min(1),
    /** Path of a Universal Character Forge character JSON inside the ZIP. */
    file: filePath,
    portrait_file: filePath.nullish(),
    is_npc: z.boolean().nullish(),
  })
  .strict();

const videoSchema = z
  .object({
    title: text(160).min(1),
    type: z.enum(["intro", "recap", "cutscene", "trailer", "handout", "vision", "dream", "other"]),
    file: filePath,
  })
  .strict();

const soundFxSchema = z
  .object({
    title: text(160).min(1),
    file: filePath,
  })
  .strict();

export const campaignPackageManifestSchema = z
  .object({
    format: z.literal("ucf-campaign-package"),
    version: z.literal(1),
    exported_at: text(40).optional(),
    campaign: z
      .object({
        name: text(120).min(1),
        description: nullableText(4000),
        settings: settingsSchema.optional(),
      })
      .strict(),
    notes: z.array(noteSchema).max(500).default([]),
    lore: z
      .object({
        entities: z.array(entitySchema).max(2000).default([]),
        relationships: z.array(relationshipSchema).max(4000).default([]),
      })
      .strict()
      .default({ entities: [], relationships: [] }),
    assets: z.array(assetSchema).max(500).default([]),
    maps: z.array(mapSchema).max(100).default([]),
    videos: z.array(videoSchema).max(100).default([]),
    soundtracks: z.array(soundtrackSchema).max(20).default([]),
    sound_fx: z.array(soundFxSchema).max(300).default([]),
    /** Legacy v1 field; new packages should use videos with type "intro". */
    intro: z.object({ file: filePath }).strict().nullish(),
    characters: z.array(characterSchema).max(300).default([]),
  })
  .strict();

export type CampaignPackageManifest = z.infer<typeof campaignPackageManifestSchema>;
export type PackageEntity = z.infer<typeof entitySchema>;
export type PackageMap = z.infer<typeof mapSchema>;

export interface CampaignImportSummary {
  campaignId: string;
  notes: number;
  entities: number;
  relationships: number;
  assets: number;
  maps: number;
  mapObjects: number;
  albums: number;
  tracks: number;
  videos: number;
  soundFx: number;
  characters: number;
  intro: boolean;
}

/** Parses and validates the manifest text, with readable errors. */
export function parseCampaignPackageManifest(raw: string): CampaignPackageManifest {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("campaign.json is not valid JSON.");
  }
  const parsed = campaignPackageManifestSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.length ? issue.path.join(".") : "campaign.json";
    throw new Error(`${where}: ${issue?.message ?? "invalid campaign package."}`);
  }
  return parsed.data;
}

/** Cross-reference checks that zod cannot express on its own. */
export function validateCampaignPackage(manifest: CampaignPackageManifest): string[] {
  const problems: string[] = [];
  const entityKeys = new Set(manifest.lore.entities.map((e) => e.key));
  const characterKeys = new Set(manifest.characters.map((c) => c.key));

  if (manifest.videos.filter((video) => video.type === "intro").length > 1) {
    problems.push("Only one video may use the intro type.");
  }
  if (manifest.intro && manifest.videos.some((video) => video.type === "intro")) {
    problems.push("Use either legacy intro or a videos entry with type intro, not both.");
  }

  if (entityKeys.size !== manifest.lore.entities.length) problems.push("Duplicate lore entity keys.");
  if (characterKeys.size !== manifest.characters.length) problems.push("Duplicate character keys.");

  for (const entity of manifest.lore.entities) {
    if (entity.parent_key && !entityKeys.has(entity.parent_key)) {
      problems.push(`Entity "${entity.key}" has an unknown parent_key "${entity.parent_key}".`);
    }
    if (entity.character_key && !characterKeys.has(entity.character_key)) {
      problems.push(`Entity "${entity.key}" links to unknown character "${entity.character_key}".`);
    }
  }
  for (const rel of manifest.lore.relationships) {
    if (!entityKeys.has(rel.source_key)) problems.push(`Relationship source "${rel.source_key}" is unknown.`);
    if (!entityKeys.has(rel.target_key)) problems.push(`Relationship target "${rel.target_key}" is unknown.`);
  }
  for (const map of manifest.maps) {
    for (const object of map.objects) {
      if (object.entity_key && !entityKeys.has(object.entity_key)) {
        problems.push(`Map "${map.name}" token "${object.label}" references unknown entity "${object.entity_key}".`);
      }
      if (object.character_key && !characterKeys.has(object.character_key)) {
        problems.push(`Map "${map.name}" token "${object.label}" references unknown character "${object.character_key}".`);
      }
    }
  }
  for (const album of manifest.soundtracks) {
    const positions = album.tracks.map((t) => t.position).sort((a, b) => a - b);
    if (positions.some((position, index) => position !== index + 1)) {
      problems.push(`Album "${album.slug}" track positions must start at 1 without gaps.`);
    }
  }
  return problems;
}

/** Every ZIP path the manifest expects to find, for a pre-flight check. */
export function referencedFiles(manifest: CampaignPackageManifest): string[] {
  const files: (string | null | undefined)[] = [
    manifest.intro?.file,
    ...manifest.videos.map((video) => video.file),
    ...manifest.sound_fx.map((effect) => effect.file),
    ...manifest.assets.map((a) => a.file),
    ...manifest.maps.flatMap((m) => [m.file, ...m.objects.map((o) => o.image_file)]),
    ...manifest.lore.entities.map((e) => e.image_file),
    ...manifest.soundtracks.flatMap((a) => [a.cover, ...a.tracks.map((t) => t.file)]),
    ...manifest.characters.flatMap((c) => [c.file, c.portrait_file]),
  ];
  return [...new Set(files.filter((file): file is string => typeof file === "string" && file !== ""))];
}
