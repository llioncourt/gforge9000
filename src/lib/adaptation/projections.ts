/**
 * Projection builders.
 *
 * These are pure functions: adapted scenes + bible records in, a comic or movie
 * projection out. They never call the network, so every layout decision is unit
 * testable and reproducible.
 */

import type {
  AdaptationScene,
  BibleRecord,
  ComicProjection,
  MovieProjection,
  StoryBible,
} from "@/lib/adaptation/protocol";

export interface ComicConfig {
  series_title: string;
  series_subtitle?: string | null;
  issue_number: number;
  issue_title: string;
  /** Desired page count. Null means "as many as the story needs". */
  page_target?: number | null;
  /** How many panels a page holds on average. */
  density: "sparse" | "standard" | "dense";
  genre: string[];
  art_direction: string;
}

export interface MovieConfig {
  title: string;
  logline: string;
  runtime_target_minutes?: number | null;
  aspect_ratio: string;
  language: string;
  style: Record<string, unknown>;
}

export interface ProjectionInput {
  scenes: AdaptationScene[];
  cast: BibleRecord[];
  locations: BibleRecord[];
  props: BibleRecord[];
  wardrobe: BibleRecord[];
  storyBible: StoryBible;
}

const PANELS_PER_PAGE: Record<ComicConfig["density"], number> = {
  sparse: 3,
  standard: 5,
  dense: 7,
};

function nameOf(records: BibleRecord[], entityId: string | null | undefined): string | null {
  if (!entityId) return null;
  return records.find((record) => record.entity_id === entityId)?.name ?? null;
}

function namesOf(records: BibleRecord[], ids: string[]): string[] {
  return ids.map((id) => nameOf(records, id)).filter((name): name is string => !!name);
}

/** Beats become panels; panels are packed into pages at the configured density. */
export function buildComicProjection(input: ProjectionInput, config: ComicConfig): ComicProjection {
  const perPage = PANELS_PER_PAGE[config.density];
  const all = input.scenes
    .slice()
    .sort((a, b) => a.sequence_no - b.sequence_no)
    .flatMap((scene) => panelsForScene(scene, input));

  const totalPanels = all.length;
  const pageCount =
    config.page_target && config.page_target > 0
      ? config.page_target
      : Math.max(1, Math.ceil(totalPanels / perPage));
  const chunk = Math.max(1, Math.ceil(totalPanels / pageCount));

  const pages: ComicProjection["target_projection"]["pages"] = [];
  for (let index = 0; index < totalPanels; index += chunk) {
    const slice = all.slice(index, index + chunk);
    if (!slice.length) break;
    pages.push({
      page_no: pages.length + 1,
      scene_keys: [...new Set(slice.map((entry) => entry.scene_key))],
      layout_hint: slice.length <= 3 ? "splash" : "grid",
      panels: slice.map((entry, panelIndex) => ({ ...entry.panel, panel_no: panelIndex + 1 })),
    });
  }

  return {
    target_system: "rx_comics",
    target_projection: {
      manifest_kind: "rx-comics-v2-manifest",
      manifest_version: "1.0",
      series: {
        title: config.series_title,
        subtitle: config.series_subtitle ?? null,
        synopsis: input.storyBible.synopsis,
        genre: config.genre,
        art_direction: config.art_direction,
      },
      issue: {
        number: config.issue_number,
        title: config.issue_title,
        synopsis: input.storyBible.logline,
        page_target: config.page_target ?? null,
        density: config.density,
      },
      characters: input.cast,
      locations: input.locations,
      props: input.props,
      wardrobe: input.wardrobe,
      pages,
      continuity: continuityRollup(input.scenes),
      loadout_hints: {
        panel_density: config.density,
        panels_per_page_target: perPage,
        total_panels: totalPanels,
      },
    },
  };
}

interface PanelEntry {
  scene_key: string;
  panel: ComicProjection["target_projection"]["pages"][number]["panels"][number];
}

function panelsForScene(scene: AdaptationScene, input: ProjectionInput): PanelEntry[] {
  const castNames = namesOf(input.cast, scene.cast_entity_ids);
  const propNames = namesOf(input.props, scene.prop_entity_ids);
  const locationName = nameOf(input.locations, scene.location_entity_id);
  const assetKeys = [
    ...input.cast.filter((c) => scene.cast_entity_ids.includes(c.entity_id ?? "")).flatMap((c) => c.asset_keys),
    ...input.locations.filter((l) => l.entity_id === scene.location_entity_id).flatMap((l) => l.asset_keys),
  ];

  const beats = scene.story_beats.length
    ? scene.story_beats.slice().sort((a, b) => a.order - b.order)
    : [{ order: 0, description: scene.synopsis || scene.title, emotion: null, entity_ids: [] }];

  const dialogue = scene.dialogue.slice().sort((a, b) => a.order - b.order);
  const narration = scene.narration.slice().sort((a, b) => a.order - b.order);

  return beats.map((beat, index) => {
    const share = dialogue.filter((_, i) => i % beats.length === index);
    const captions = narration.filter((_, i) => i % beats.length === index).map((n) => n.text);
    return {
      scene_key: scene.stable_key,
      panel: {
        panel_no: index + 1,
        shot: index === 0 ? "establishing" : "medium",
        description: beat.description,
        characters: castNames,
        location: locationName,
        props: propNames,
        wardrobe: scene.wardrobe_refs.map((ref) => `${ref.character_name}: ${ref.description}`),
        emotions: beat.emotion ? [beat.emotion] : [],
        dialogue: share.map((line) => ({
          speaker: line.speaker,
          text: line.line,
          balloon_type: line.balloon_type,
        })),
        captions,
        sfx: [],
        visual_direction: scene.dramatic_goal,
        asset_keys: [...new Set(assetKeys)],
      },
    };
  });
}

/** Each adapted scene becomes one movie scene carrying a materialisable pack v2 seed. */
export function buildMovieProjection(input: ProjectionInput, config: MovieConfig): MovieProjection {
  const scenes = input.scenes
    .slice()
    .sort((a, b) => a.sequence_no - b.sequence_no)
    .map((scene, index) => {
      const locationName = nameOf(input.locations, scene.location_entity_id);
      const beats = scene.story_beats.length
        ? scene.story_beats.slice().sort((a, b) => a.order - b.order)
        : [{ order: 0, description: scene.synopsis || scene.title, emotion: null, entity_ids: [] }];
      const dialogue = scene.dialogue.slice().sort((a, b) => a.order - b.order);

      return {
        scene_key: scene.stable_key,
        scene_no: index + 1,
        slugline: sluglineFor(scene.title, locationName, scene.continuity_state),
        synopsis: scene.synopsis,
        location: locationName,
        time_of_day: timeOfDay(scene.continuity_state),
        cast: namesOf(input.cast, scene.cast_entity_ids),
        props: namesOf(input.props, scene.prop_entity_ids),
        wardrobe: scene.wardrobe_refs.map((ref) => `${ref.character_name}: ${ref.description}`),
        continuity: scene.continuity_state,
        pack_seed: {
          format: "moviesmith.pack.v2" as const,
          cuts: beats.map((beat, beatIndex) => {
            const lines = dialogue.filter((_, i) => i % beats.length === beatIndex);
            return {
              cut_no: beatIndex + 1,
              shot: beatIndex === 0 ? "establishing" : "medium",
              duration_seconds: Math.min(30, Math.max(2, 2 + lines.length * 2.5)),
              description: beat.description,
              camera: beatIndex === 0 ? "slow push in" : "static",
              actions: beat.entity_ids
                .map((id) => nameOf(input.cast, id))
                .filter((name): name is string => !!name)
                .map((actor) => ({ actor, action: beat.description })),
              tts: lines.map((line) => ({
                speaker: line.speaker,
                line: line.line,
                voice_hint: null,
                emotion: line.delivery ?? beat.emotion ?? null,
                lipsync: line.balloon_type !== "thought" && line.balloon_type !== "off_panel",
              })),
              sfx: [],
              music: null,
            };
          }),
        },
      };
    });

  return {
    target_system: "moviesmith",
    target_projection: {
      format: "moviesmith.movie.v1",
      movie: {
        title: config.title,
        logline: config.logline || input.storyBible.logline,
        synopsis: input.storyBible.synopsis,
        runtime_target_minutes: config.runtime_target_minutes ?? null,
        aspect_ratio: config.aspect_ratio,
        language: config.language,
      },
      story_bible: input.storyBible,
      cast: input.cast,
      locations: input.locations,
      props: input.props,
      wardrobe: input.wardrobe,
      style: config.style,
      scenes,
    },
  };
}

function sluglineFor(
  title: string,
  location: string | null,
  continuity: Record<string, unknown>,
): string {
  const interior = String(continuity["interior"] ?? "").toLowerCase();
  const prefix = interior === "false" || interior === "exterior" ? "EXT." : "INT.";
  return `${prefix} ${(location ?? title).toUpperCase()} — ${timeOfDay(continuity)}`;
}

function timeOfDay(continuity: Record<string, unknown>): string {
  const value = String(continuity["time_of_day"] ?? "").trim();
  return value ? value.toUpperCase() : "DAY";
}

function continuityRollup(scenes: AdaptationScene[]): Record<string, unknown> {
  const rollup: Record<string, unknown> = {};
  for (const scene of scenes) {
    for (const [key, value] of Object.entries(scene.continuity_state)) {
      const bucket = (rollup[key] as unknown[] | undefined) ?? [];
      if (!bucket.includes(value)) bucket.push(value);
      rollup[key] = bucket;
    }
  }
  return rollup;
}
