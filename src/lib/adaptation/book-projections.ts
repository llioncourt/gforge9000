/**
 * Book projections: Narrative novelization and GURPS Adventure Module.
 *
 * Pure and deterministic. Both read the shared reconstruction (scenes, facts,
 * bibles) — nothing here rescans or re-reconstructs the campaign. Anything the
 * builders add that the campaign never stated is tagged `adaptation_created`
 * and left `needs_review`, so it can always be told apart from canon.
 */

import type {
  AdaptationFact,
  AdaptationScene,
  AdventureModuleProjection,
  BibleRecord,
  BookLengthMode,
  BookNarrativeProjection,
  StoryBible,
} from "@/lib/adaptation/protocol";
import { MODULE_APPROACHES } from "@/lib/adaptation/protocol";
import { stableHash } from "@/lib/adaptation/hash";

export interface BookNarrativeConfig {
  title: string;
  subtitle?: string | null;
  language: string;
  length_mode: BookLengthMode;
  chapter_target?: number | null;
  word_target?: number | null;
}

export interface AdventureModuleConfig {
  title: string;
  subtitle?: string | null;
  language: string;
  game_system: "gurps_4e";
  adaptation_level: "complete_module";
  players_min: number;
  players_max: number;
  starting_points?: number | null;
  tech_level?: number | null;
  /** How many alternative routes each encounter offers beside the original one. */
  branching: "light" | "standard" | "rich";
  include_stat_blocks: boolean;
}

export const DEFAULT_BOOK_NARRATIVE: Omit<BookNarrativeConfig, "title"> = {
  subtitle: null,
  language: "en",
  length_mode: "auto",
  chapter_target: null,
  word_target: null,
};

export const DEFAULT_ADVENTURE_MODULE: Omit<AdventureModuleConfig, "title"> = {
  subtitle: null,
  language: "en",
  game_system: "gurps_4e",
  adaptation_level: "complete_module",
  players_min: 3,
  players_max: 5,
  starting_points: 150,
  tech_level: null,
  branching: "standard",
  include_stat_blocks: true,
};

export interface NarrativeDirection {
  tone?: string;
  pov?: string;
  audience?: string;
}

export interface StatBlockInput {
  st: number;
  dx: number;
  iq: number;
  ht: number;
  hp: number;
  will: number;
  per: number;
  fp: number;
  basic_speed: number;
  basic_move: number;
  dodge: number;
  point_total?: number | null;
  source_character_id?: string | null;
}

export interface BookProjectionInput {
  scenes: AdaptationScene[];
  facts: AdaptationFact[];
  cast: BibleRecord[];
  locations: BibleRecord[];
  props: BibleRecord[];
  storyBible: StoryBible;
  direction: NarrativeDirection;
  assets?: { asset_key: string; role: string; entity_id?: string | null; entity_name?: string | null }[];
  /** GURPS stat blocks keyed by entity id, already derived by the rules engine. */
  statBlocks?: Record<string, StatBlockInput>;
  /** Entities the campaign marks as player characters. */
  playerCharacterIds?: string[];
}

/* ---------------------------------------------------------------- helpers */

const words = (value: string | null | undefined) =>
  (value ?? "").trim() ? (value ?? "").trim().split(/\s+/).length : 0;

function ordered(scenes: AdaptationScene[]) {
  return scenes
    .filter((scene) => scene.review_status !== "rejected")
    .slice()
    .sort((a, b) => a.sequence_no - b.sequence_no);
}

function nameOf(records: BibleRecord[], id: string | null | undefined) {
  if (!id) return null;
  return records.find((record) => record.entity_id === id)?.name ?? null;
}

function sceneWords(scene: AdaptationScene) {
  return (
    words(scene.synopsis) +
    scene.story_beats.reduce((n, b) => n + words(b.description), 0) +
    scene.dialogue.reduce((n, d) => n + words(d.line), 0) +
    scene.narration.reduce((n, d) => n + words(d.text), 0)
  );
}

/**
 * Splits `n` ordered items into `k` contiguous groups. Each ideal boundary may
 * shift by one to land on a change of location, so chapters break where the
 * story naturally moves on.
 */
export function partition<T>(items: T[], k: number, breakBefore: (index: number) => boolean): T[][] {
  const n = items.length;
  const count = Math.max(1, Math.min(k, n));
  const cuts: number[] = [];
  for (let i = 1; i < count; i++) {
    const ideal = Math.round((i * n) / count);
    let cut = ideal;
    if (!breakBefore(ideal)) {
      if (ideal - 1 > (cuts.at(-1) ?? 0) && breakBefore(ideal - 1)) cut = ideal - 1;
      else if (ideal + 1 < n && breakBefore(ideal + 1)) cut = ideal + 1;
    }
    if (cut > (cuts.at(-1) ?? 0) && cut < n) cuts.push(cut);
  }
  const groups: T[][] = [];
  let start = 0;
  for (const cut of [...cuts, n]) {
    groups.push(items.slice(start, cut));
    start = cut;
  }
  return groups.filter((group) => group.length);
}

/* ---------------------------------------------------------- book: structure */

const FORM_DEFAULT_WORDS = { short_story: 7_500, novella: 30_000, novel: 80_000 } as const;

export function resolveBookStructure(
  scenes: AdaptationScene[],
  config: Pick<BookNarrativeConfig, "length_mode" | "chapter_target" | "word_target">,
) {
  const n = scenes.length;
  const sourceWords = scenes.reduce((sum, scene) => sum + sceneWords(scene), 0);
  const reasons: string[] = [];
  let form: "short_story" | "novella" | "novel";
  if (config.length_mode !== "auto") {
    form = config.length_mode;
    reasons.push("explicit_length_mode");
  } else if (n <= 3) {
    form = "short_story";
    reasons.push("few_scenes");
  } else if (n <= 12) {
    form = "novella";
    reasons.push("moderate_scene_count");
  } else {
    form = "novel";
    reasons.push("many_scenes");
  }
  const byForm = form === "short_story" ? 1 : form === "novella" ? Math.ceil(n / 2) : Math.ceil(n / 3);
  let chapters = byForm;
  if (config.chapter_target && config.chapter_target > 0) {
    chapters = config.chapter_target;
    reasons.push("chapter_target");
  }
  chapters = Math.max(1, Math.min(chapters, Math.max(1, n)));
  if (config.chapter_target && chapters < config.chapter_target) reasons.push("capped_by_scene_count");
  const wordTarget =
    config.word_target && config.word_target > 0
      ? config.word_target
      : config.length_mode === "auto"
        ? null
        : FORM_DEFAULT_WORDS[form];
  if (config.word_target) reasons.push("word_target");
  return { form, chapters, sourceWords, wordTarget, reasons };
}

/* ----------------------------------------------------------- book: builder */

export function buildBookNarrativeProjection(
  input: BookProjectionInput,
  config: BookNarrativeConfig,
): BookNarrativeProjection {
  const scenes = ordered(input.scenes);
  const structure = resolveBookStructure(scenes, config);
  const groups = partition(
    scenes,
    structure.chapters,
    (index) =>
      index > 0 &&
      index < scenes.length &&
      scenes[index]!.location_entity_id !== scenes[index - 1]!.location_entity_id,
  );

  let reconstructedLines = 0;
  let createdSections = 0;
  let unreviewed = 0;
  const appearances = new Map<string, Set<number>>();

  const chapters = groups.map((group, chapterIndex) => {
    const chapterNo = chapterIndex + 1;
    const sections: BookNarrativeProjection["target_projection"]["chapters"][number]["sections"] = [];
    group.forEach((scene, sceneIndex) => {
      const previous = sceneIndex > 0 ? group[sceneIndex - 1]! : null;
      if (previous && previous.location_entity_id !== scene.location_entity_id) {
        createdSections++;
        unreviewed++;
        const from = nameOf(input.locations, previous.location_entity_id);
        const to = nameOf(input.locations, scene.location_entity_id);
        sections.push({
          section_no: sections.length + 1,
          kind: "transition",
          scene_key: null,
          heading: null,
          location: to,
          characters: [],
          paragraphs: [
            {
              kind: "transition",
              text: "",
              speaker: null,
              delivery: null,
              provenance_type: "adaptation_created",
              writing_brief: JSON.stringify({
                from_scene: previous.stable_key,
                to_scene: scene.stable_key,
                from_location: from,
                to_location: to,
                must_not_contradict: [previous.stable_key, scene.stable_key],
              }),
            },
          ],
          provenance_type: "adaptation_created",
          review_status: "needs_review",
          source_refs: [],
        });
      }

      const characters = scene.cast_entity_ids
        .map((id) => nameOf(input.cast, id))
        .filter((name): name is string => !!name);
      for (const name of characters) {
        appearances.set(name, (appearances.get(name) ?? new Set()).add(chapterNo));
      }

      const paragraphs: BookNarrativeProjection["target_projection"]["chapters"][number]["sections"][number]["paragraphs"] = [];
      const narration = scene.narration.slice().sort((a, b) => a.order - b.order);
      const beats = scene.story_beats.slice().sort((a, b) => a.order - b.order);
      const dialogue = scene.dialogue.slice().sort((a, b) => a.order - b.order);
      if (!narration.length && scene.synopsis) {
        paragraphs.push(para("narration", scene.synopsis, scene.provenance_type));
      }
      const rounds = Math.max(narration.length, beats.length, 1);
      for (let i = 0; i < rounds; i++) {
        if (narration[i]) paragraphs.push(para("narration", narration[i]!.text, scene.provenance_type));
        if (beats[i]) paragraphs.push(para("action", beats[i]!.description, scene.provenance_type));
        const lines = dialogue.filter((_, index) => index % rounds === i);
        for (const line of lines) {
          // A line with no literal record behind it is a reconstruction, never a quote.
          const provenance = scene.provenance_type === "ai_inference" ? "ai_inference" : scene.provenance_type;
          if (provenance === "ai_inference" || provenance === "adaptation_created") reconstructedLines++;
          paragraphs.push({
            kind: "dialogue",
            text: line.line,
            speaker: line.speaker,
            delivery: line.delivery ?? null,
            provenance_type: provenance,
            writing_brief: null,
          });
        }
      }
      if (scene.review_status !== "confirmed") unreviewed++;
      sections.push({
        section_no: sections.length + 1,
        kind: "scene",
        scene_key: scene.stable_key,
        heading: scene.title,
        location: nameOf(input.locations, scene.location_entity_id),
        characters,
        paragraphs,
        provenance_type: scene.provenance_type,
        review_status: scene.review_status,
        source_refs: scene.source_refs,
      });
    });

    const sourceWords = group.reduce((sum, scene) => sum + sceneWords(scene), 0);
    const castCount = new Map<string, number>();
    for (const scene of group)
      for (const id of scene.cast_entity_ids) castCount.set(id, (castCount.get(id) ?? 0) + 1);
    const lead = [...castCount.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
    return {
      chapter_no: chapterNo,
      key: `chapter:${stableHash(group.map((s) => s.stable_key).join("|")).slice(0, 16)}`,
      title: group.length === 1 ? group[0]!.title : `${group[0]!.title} — ${group.at(-1)!.title}`,
      summary: group.map((scene) => scene.synopsis).filter(Boolean).join(" "),
      pov_character: lead ? nameOf(input.cast, lead[0]) : null,
      scene_keys: group.map((scene) => scene.stable_key),
      word_target:
        structure.wordTarget && structure.sourceWords
          ? Math.round((structure.wordTarget * sourceWords) / structure.sourceWords)
          : structure.wordTarget
            ? Math.round(structure.wordTarget / groups.length)
            : null,
      source_word_count: sourceWords,
      sections,
      source_refs: dedupeRefs(group.flatMap((scene) => scene.source_refs)),
    };
  });

  return {
    target_system: "book",
    target_projection: {
      format: "awd.book.narrative.v1",
      front_matter: {
        title: config.title,
        subtitle: config.subtitle ?? null,
        language: config.language,
        logline: input.storyBible.logline,
        synopsis: input.storyBible.synopsis,
        tone: input.direction.tone ?? input.storyBible.tone ?? "",
        pov: input.direction.pov ?? "",
        audience: input.direction.audience ?? "",
      },
      structure: {
        length_mode: config.length_mode,
        resolved_form: structure.form,
        chapter_count: chapters.length || 1,
        chapter_target: config.chapter_target ?? null,
        word_target: structure.wordTarget,
        source_word_count: structure.sourceWords,
        reasons: structure.reasons,
      },
      chapters,
      dramatis_personae: input.cast
        .filter((record) => appearances.has(record.name))
        .map((record) => ({
          name: record.name,
          entity_id: record.entity_id ?? null,
          description: record.gm_only ? "" : record.biography,
          chapters: [...(appearances.get(record.name) ?? [])].sort((a, b) => a - b),
        })),
      locations: input.locations.filter((record) =>
        scenes.some((scene) => scene.location_entity_id === record.entity_id),
      ),
      adaptation_notes: {
        canon_preserved: true,
        reconstructed_dialogue_lines: reconstructedLines,
        adaptation_created_sections: createdSections,
        unreviewed_sections: unreviewed,
      },
    },
  };
}

function para(
  kind: "narration" | "action",
  value: string,
  provenance: AdaptationScene["provenance_type"],
) {
  return {
    kind,
    text: value,
    speaker: null,
    delivery: null,
    provenance_type: provenance,
    writing_brief: null,
  };
}

function dedupeRefs<T extends { source_key: string }>(list: T[]): T[] {
  const seen = new Map<string, T>();
  for (const ref of list) if (!seen.has(ref.source_key)) seen.set(ref.source_key, ref);
  return [...seen.values()];
}

/* ------------------------------------------------------- adventure module */

/** GURPS skills commonly rolled for each approach. Names only; the GM sets modifiers. */
const APPROACH_SKILLS: Record<(typeof MODULE_APPROACHES)[number], string[]> = {
  social: ["Diplomacy", "Fast-Talk", "Intimidation"],
  stealth: ["Stealth", "Shadowing", "Lockpicking"],
  force: ["Tactics", "Brawling", "Leadership"],
  investigation: ["Observation", "Search", "Research"],
  evasion: ["Running", "Climbing", "Area Knowledge"],
};

const ROUTES_PER_BRANCHING = { light: 2, standard: 3, rich: 5 } as const;

function isGmOnly(fact: AdaptationFact) {
  if (fact.knowledge_state) return !fact.knowledge_state.revealed && fact.gm_only;
  return fact.gm_only;
}

export function buildAdventureModuleProjection(
  input: BookProjectionInput,
  config: AdventureModuleConfig,
): AdventureModuleProjection {
  const scenes = ordered(input.scenes);
  const facts = input.facts.filter((fact) => fact.canon_status !== "rejected");
  const pcIds = new Set(input.playerCharacterIds ?? []);

  // Acts: roughly three to five movements, broken on location changes.
  const actCount = scenes.length <= 3 ? 1 : scenes.length <= 8 ? 3 : Math.min(5, Math.ceil(scenes.length / 3));
  const actGroups = partition(
    scenes,
    actCount,
    (index) =>
      index > 0 &&
      index < scenes.length &&
      scenes[index]!.location_entity_id !== scenes[index - 1]!.location_entity_id,
  );
  const encounterKey = (scene: AdaptationScene) => `encounter:${scene.stable_key}`;
  const actOf = new Map<string, number>();
  actGroups.forEach((group, index) => group.forEach((scene) => actOf.set(scene.stable_key, index + 1)));

  // Clues and revelations from facts: GM truth vs what characters can find vs what players can be shown.
  const subjectScenes = (subject: string | null | undefined) =>
    subject
      ? scenes.filter(
          (scene) =>
            scene.cast_entity_ids.includes(subject) ||
            scene.location_entity_id === subject ||
            scene.prop_entity_ids.includes(subject),
        )
      : [];

  const truths = facts.filter(isGmOnly);
  const visible = facts.filter((fact) => !isGmOnly(fact) && fact.provenance_type !== "conflict");

  const clues: AdventureModuleProjection["target_projection"]["clues"] = [];
  for (const fact of visible) {
    const found = subjectScenes(fact.subject_entity_id).map(encounterKey);
    const points = truths
      .filter((truth) => truth.subject_entity_id && truth.subject_entity_id === fact.subject_entity_id)
      .map((truth) => `revelation:${truth.stable_key}`);
    clues.push({
      key: `clue:${fact.stable_key}`,
      statement: fact.statement,
      fact_key: fact.stable_key,
      audience: points.length ? "discoverable" : "player_facing",
      points_to: points,
      found_in: found,
      reveal_conditions: found.length ? found.map((key) => `explore:${key}`) : ["gm_discretion"],
      if_missed: found.length > 1 ? `also_available_in:${found.slice(1).join(",")}` : "gm_offers_alternative_source",
      revealed_in_original: fact.knowledge_state?.revealed ?? !fact.gm_only,
      provenance_type: fact.provenance_type,
      source_refs: fact.source_refs,
    });
  }
  for (const truth of truths) {
    clues.push({
      key: `clue:${truth.stable_key}`,
      statement: truth.statement,
      fact_key: truth.stable_key,
      audience: "gm_only",
      points_to: [`revelation:${truth.stable_key}`],
      found_in: subjectScenes(truth.subject_entity_id).map(encounterKey),
      reveal_conditions: ["gm_only_until_revealed"],
      if_missed: "truth_stays_hidden_consequences_apply",
      revealed_in_original: truth.knowledge_state?.revealed ?? false,
      provenance_type: truth.provenance_type,
      source_refs: truth.source_refs,
    });
  }

  const alternatives = ROUTES_PER_BRANCHING[config.branching];
  const encounters = scenes.map((scene, index) => {
    const key = encounterKey(scene);
    const next = scenes[index + 1] ? [encounterKey(scenes[index + 1]!)] : [];
    const skip = scenes[index + 2] ? [encounterKey(scenes[index + 2]!)] : next;
    const approaches = MODULE_APPROACHES.slice(0, alternatives);
    const routes: AdventureModuleProjection["target_projection"]["encounters"][number]["routes"] = [
      {
        key: `${key}:original`,
        approach: "original_table",
        description: scene.synopsis || scene.title,
        original_table: true,
        suggested_skills: [],
        modifier: null,
        leads_to: next,
        provenance_type: scene.provenance_type,
        review_status: scene.review_status,
      },
      ...approaches.map((approach, i) => ({
        key: `${key}:${approach}`,
        approach,
        description: scene.dramatic_goal || scene.title,
        original_table: false,
        suggested_skills: APPROACH_SKILLS[approach],
        modifier: null,
        // Alternating routes let the party bypass a beat instead of forcing it.
        leads_to: i % 2 === 0 ? next : skip,
        provenance_type: "adaptation_created" as const,
        review_status: "needs_review" as const,
      })),
    ];
    const clueKeys = clues.filter((clue) => clue.found_in.includes(key)).map((clue) => clue.key);
    const handouts = (input.assets ?? [])
      .filter(
        (asset) =>
          (asset.role === "map" || asset.role === "reference") &&
          (asset.entity_id === scene.location_entity_id || scene.prop_entity_ids.includes(asset.entity_id ?? "")),
      )
      .map((asset) => asset.asset_key);
    return {
      key,
      scene_key: scene.stable_key,
      act_no: actOf.get(scene.stable_key) ?? 1,
      title: scene.title,
      gm_summary: scene.synopsis,
      player_framing: scene.gm_only ? "" : scene.narration.map((n) => n.text).join("\n\n"),
      objective: scene.dramatic_goal,
      location: nameOf(input.locations, scene.location_entity_id),
      npcs: scene.cast_entity_ids
        .filter((id) => !pcIds.has(id))
        .map((id) => nameOf(input.cast, id))
        .filter((name): name is string => !!name),
      clue_keys: clueKeys,
      routes,
      outcomes: [
        { condition: "success" as const, consequence: next[0] ? `advance:${next[0]}` : "resolution", provenance_type: "adaptation_created" as const },
        { condition: "partial" as const, consequence: next[0] ? `advance_with_complication:${next[0]}` : "resolution_with_cost", provenance_type: "adaptation_created" as const },
        { condition: "failure" as const, consequence: clueKeys.length ? `clues_move_elsewhere:${clueKeys.length}` : "situation_escalates", provenance_type: "adaptation_created" as const },
        { condition: "skipped" as const, consequence: skip[0] ? `continue:${skip[0]}` : "resolution", provenance_type: "adaptation_created" as const },
      ],
      hazards: [],
      handout_asset_keys: [...new Set(handouts)],
      gm_only: true,
      source_refs: scene.source_refs,
    };
  });

  const encounterKeysFor = (id: string | null | undefined) =>
    scenes
      .filter((scene) => scene.cast_entity_ids.includes(id ?? "") || scene.location_entity_id === id)
      .map(encounterKey);

  const npcs = input.cast.map((record) => {
    const id = record.entity_id ?? null;
    const role: "antagonist" | "ally" | "neutral" | "player_character" = id && pcIds.has(id)
      ? "player_character"
      : record.traits.some((trait) => /antag|villain|enemy|vil[aã]o|inimig/i.test(trait))
        ? "antagonist"
        : record.traits.some((trait) => /ally|aliad|friend|amig/i.test(trait))
          ? "ally"
          : "neutral";
    const block = id && config.include_stat_blocks ? input.statBlocks?.[id] : undefined;
    return {
      key: record.key,
      entity_id: id,
      name: record.name,
      role,
      player_description: record.gm_only ? "" : record.visual_description,
      gm_notes: record.biography,
      gurps: block
        ? { ...block, point_total: block.point_total ?? null, source_character_id: block.source_character_id ?? null }
        : null,
      encounter_keys: encounterKeysFor(id),
      asset_keys: record.asset_keys,
      source_refs: record.source_refs,
    };
  });

  const first = encounters[0];
  const hooks = scenes.slice(0, 1).map((scene) => ({
    key: `hook:${scene.stable_key}`,
    text: scene.dramatic_goal || scene.synopsis,
    provenance_type: scene.provenance_type,
    source_refs: scene.source_refs,
  }));

  return {
    target_system: "gurps",
    target_projection: {
      format: "awd.adventure-module.gurps.v1",
      game_system: "gurps_4e",
      adaptation_level: "complete_module",
      front_matter: {
        title: config.title,
        subtitle: config.subtitle ?? null,
        language: config.language,
        players_min: config.players_min,
        players_max: Math.max(config.players_min, config.players_max),
        starting_points: config.starting_points ?? null,
        tech_level: config.tech_level ?? null,
      },
      introduction: { gm_summary: input.storyBible.synopsis, player_pitch: input.storyBible.logline },
      overview: {
        premise: input.storyBible.logline,
        themes: input.storyBible.themes,
        tone: input.direction.tone || input.storyBible.tone,
        act_count: actGroups.length,
        encounter_count: encounters.length,
      },
      background: {
        gm_truth: [input.storyBible.timeline_summary, ...truths.map((t) => t.statement)].filter(Boolean).join("\n\n"),
        common_knowledge: [input.storyBible.setting, ...visible.filter((f) => !f.gm_only).map((f) => f.statement)]
          .filter(Boolean)
          .join("\n\n"),
      },
      hooks,
      npcs,
      antagonist_keys: npcs.filter((npc) => npc.role === "antagonist").map((npc) => npc.key),
      locations: input.locations.map((record) => ({
        key: record.key,
        entity_id: record.entity_id ?? null,
        name: record.name,
        player_description: record.gm_only ? "" : record.visual_description,
        gm_notes: record.biography,
        map_asset_keys: (input.assets ?? [])
          .filter((asset) => asset.role === "map" && asset.entity_id === record.entity_id)
          .map((asset) => asset.asset_key),
        encounter_keys: encounterKeysFor(record.entity_id),
        source_refs: record.source_refs,
      })),
      chronology: {
        initial_situation: scenes[0]?.synopsis ?? "",
        events: scenes.map((scene, index) => ({
          order: index + 1,
          scene_key: scene.stable_key,
          summary: scene.synopsis || scene.title,
        })),
      },
      getting_started: {
        opening_encounter_key: first?.key ?? null,
        player_framing: first?.player_framing ?? "",
      },
      acts: actGroups.map((group, index) => ({
        act_no: index + 1,
        title: group[0]!.title,
        summary: group.map((scene) => scene.synopsis).filter(Boolean).join(" "),
        encounter_keys: group.map(encounterKey),
      })),
      encounters,
      clues,
      revelations: truths.map((truth) => ({
        key: `revelation:${truth.stable_key}`,
        statement: truth.statement,
        clue_keys: clues.filter((clue) => clue.points_to.includes(`revelation:${truth.stable_key}`)).map((c) => c.key),
        revealed_in_original: truth.knowledge_state?.revealed ?? false,
        source_refs: truth.source_refs,
      })),
      handouts: (input.assets ?? [])
        .filter((asset) => asset.role === "map" || asset.role === "reference")
        .map((asset) => {
          const owner = [...input.cast, ...input.locations, ...input.props].find(
            (record) => record.entity_id === asset.entity_id,
          );
          return {
            asset_key: asset.asset_key,
            role: asset.role as "map" | "reference",
            title: asset.entity_name ?? asset.asset_key,
            player_safe: owner ? !owner.gm_only : false,
          };
        }),
      appendices: {
        fact_index: facts.map((fact) => ({
          key: fact.stable_key,
          statement: fact.statement,
          provenance_type: fact.provenance_type,
          gm_only: isGmOnly(fact),
        })),
      },
    },
  };
}
