import { describe, expect, it } from "vitest";

import {
  buildAdventureModuleProjection,
  buildBookNarrativeProjection,
  DEFAULT_ADVENTURE_MODULE,
  DEFAULT_BOOK_NARRATIVE,
  partition,
  resolveBookStructure,
  type BookProjectionInput,
} from "@/lib/adaptation/book-projections";
import {
  adaptationManifestSchema,
  adventureModuleProjectionSchema,
  bookNarrativeProjectionSchema,
  type AdaptationScene,
} from "@/lib/adaptation/protocol";
import { activeWizardSteps, resolveWizardStep, selectedTargets } from "@/lib/adaptation/types";
import { targetConfigProblems } from "@/lib/adaptation/validation";
import { renderAdventureModuleMarkdown, renderBookMarkdown } from "@/lib/adaptation/book-render";

const ref = (id: string) => ({ source_type: "entity", source_key: `entity:${id}`, source_id: id });

function scene(n: number, location: string, over: Partial<AdaptationScene> = {}): AdaptationScene {
  return {
    stable_key: `scene-${n}`,
    sequence_no: n,
    title: `Scene ${n}`,
    synopsis: `Something happens in scene ${n}.`,
    dramatic_goal: `Goal ${n}`,
    story_beats: [{ order: 0, description: `Beat ${n}`, entity_ids: ["hero"] }],
    dialogue: [{ order: 0, speaker: "Hero", line: `Line ${n}`, balloon_type: "balloon" }],
    narration: [{ order: 0, text: `Narration ${n}`, placement: "caption" }],
    cast_entity_ids: ["hero", "villain"],
    location_entity_id: location,
    prop_entity_ids: [],
    wardrobe_refs: [],
    continuity_state: {},
    source_refs: [ref(`s${n}`)],
    provenance_type: "session_derived",
    review_status: "confirmed",
    content_hash: "",
    gm_only: false,
    ...over,
  };
}

const bible = (id: string, name: string, kind: string, traits: string[] = []) => ({
  entity_id: id,
  key: id,
  name,
  kind,
  biography: `${name} bio`,
  visual_description: `${name} look`,
  traits,
  asset_keys: [],
  source_refs: [ref(id)],
  gm_only: false,
});

function input(count = 7): BookProjectionInput {
  return {
    scenes: Array.from({ length: count }, (_, i) => scene(i + 1, i < 3 ? "castle" : "forest")),
    facts: [
      {
        stable_key: "secret",
        subject_entity_id: "villain",
        fact_type: "secret",
        statement: "The villain is the king's brother.",
        provenance_type: "campaign_canon",
        source_refs: [ref("villain")],
        confidence: 1,
        canon_status: "confirmed",
        conflict_with: [],
        gm_only: true,
      },
      {
        stable_key: "rumor",
        subject_entity_id: "villain",
        fact_type: "rumor",
        statement: "The villain wears the royal crest.",
        provenance_type: "campaign_canon",
        source_refs: [ref("villain")],
        confidence: 1,
        canon_status: "confirmed",
        conflict_with: [],
        gm_only: false,
      },
    ],
    cast: [bible("hero", "Hero", "PC"), bible("villain", "Villain", "NPC", ["antagonist"])],
    locations: [bible("castle", "Castle", "LOCATION"), bible("forest", "Forest", "LOCATION")],
    props: [],
    storyBible: {
      logline: "A hero faces a villain.",
      synopsis: "Long synopsis.",
      themes: ["loyalty"],
      tone: "grim",
      genre: [],
      setting: "A kingdom.",
      timeline_summary: "Years ago…",
    },
    direction: { tone: "grim", pov: "third", audience: "adult" },
    playerCharacterIds: ["hero"],
    statBlocks: {
      villain: {
        st: 12,
        dx: 11,
        iq: 13,
        ht: 10,
        hp: 12,
        will: 14,
        per: 13,
        fp: 10,
        basic_speed: 5.25,
        basic_move: 5,
        dodge: 8,
      },
    },
  };
}

describe("targets and wizard steps", () => {
  it("older rows without book columns keep their comic/movie selection", () => {
    expect(selectedTargets({ target_comic: true, target_movie: false })).toEqual(["comic"]);
  });

  it("only selected targets contribute steps", () => {
    const steps = activeWizardSteps({ target_book_narrative: true });
    expect(steps).toContain("book_narrative");
    expect(steps).not.toContain("comic");
    expect(steps).not.toContain("movie");
    expect(steps).not.toContain("adventure_module");
    expect(steps.at(-1)).toBe("generate");
  });

  it("a stored step whose target was deselected moves forward, not to the start", () => {
    expect(resolveWizardStep("comic", { target_movie: true })).toBe("movie");
    expect(resolveWizardStep("movie", { target_comic: true })).toBe("validation");
    expect(resolveWizardStep("bogus", {})).toBe("source");
    expect(resolveWizardStep("canon", {})).toBe("canon");
  });
});

describe("book target validation", () => {
  it("does not block unselected targets", () => {
    expect(targetConfigProblems({ target_comic: true, creative_settings: {} })).toEqual([]);
  });
  it("flags missing titles and bad player ranges", () => {
    expect(
      targetConfigProblems({
        target_book_narrative: true,
        target_adventure_module: true,
        creative_settings: {},
      }),
    ).toEqual(["noBookConfig", "noModuleConfig"]);
    expect(
      targetConfigProblems({
        target_adventure_module: true,
        creative_settings: { adventure_module: { title: "X", players_min: 4, players_max: 2 } },
      }),
    ).toEqual(["noModuleConfig"]);
    expect(
      targetConfigProblems({
        target_book_narrative: true,
        creative_settings: { book_narrative: { title: "Book" } },
      }),
    ).toEqual([]);
  });
});

describe("book structure", () => {
  it("partition keeps order and prefers location breaks", () => {
    const items = ["a", "a", "a", "b", "b", "b"];
    expect(partition(items, 2, (i) => items[i] !== items[i - 1])).toEqual([
      ["a", "a", "a"],
      ["b", "b", "b"],
    ]);
  });
  it("automatic mode picks a form from the material", () => {
    expect(resolveBookStructure(input(2).scenes, { length_mode: "auto" }).form).toBe("short_story");
    expect(resolveBookStructure(input(7).scenes, { length_mode: "auto" }).form).toBe("novella");
    expect(resolveBookStructure(input(20).scenes, { length_mode: "auto" }).form).toBe("novel");
  });
  it("chapter target is honoured but capped by scene count", () => {
    const s = resolveBookStructure(input(4).scenes, { length_mode: "novel", chapter_target: 10 });
    expect(s.chapters).toBe(4);
    expect(s.reasons).toContain("capped_by_scene_count");
  });
});

describe("book narrative projection", () => {
  const book = buildBookNarrativeProjection(input(), {
    ...DEFAULT_BOOK_NARRATIVE,
    title: "The Book",
  });

  it("is valid and deterministic", () => {
    expect(bookNarrativeProjectionSchema.parse(book)).toBeTruthy();
    expect(
      buildBookNarrativeProjection(input(), { ...DEFAULT_BOOK_NARRATIVE, title: "The Book" }),
    ).toEqual(book);
  });
  it("covers every scene once, in order, in chapters", () => {
    const keys = book.target_projection.chapters.flatMap((c) => c.scene_keys);
    expect(keys).toEqual(input().scenes.map((s) => s.stable_key));
    expect(book.target_projection.chapters.length).toBe(4);
  });
  it("marks bridging material as adaptation-created, never canon", () => {
    const transitions = book.target_projection.chapters
      .flatMap((c) => c.sections)
      .filter((s) => s.kind === "transition");
    for (const t of transitions) expect(t.provenance_type).toBe("adaptation_created");
  });
  it("renders a readable draft", () => {
    expect(renderBookMarkdown(book)).toContain("# The Book");
  });
});

describe("adventure module projection", () => {
  const module = buildAdventureModuleProjection(input(), {
    ...DEFAULT_ADVENTURE_MODULE,
    title: "The Module",
  });
  const p = module.target_projection;

  it("is valid GURPS complete module", () => {
    expect(adventureModuleProjectionSchema.parse(module)).toBeTruthy();
    expect(p.game_system).toBe("gurps_4e");
    expect(p.adaptation_level).toBe("complete_module");
  });
  it("the original solution is one route among alternatives", () => {
    for (const e of p.encounters) {
      expect(e.routes.filter((r) => r.original_table)).toHaveLength(1);
      expect(e.routes.filter((r) => !r.original_table).length).toBe(3);
      for (const r of e.routes.filter((x) => !x.original_table)) {
        expect(r.provenance_type).toBe("adaptation_created");
        expect(r.review_status).toBe("needs_review");
      }
    }
  });
  it("separates GM truth from discoverable clues", () => {
    const secret = p.clues.find((c) => c.fact_key === "secret")!;
    const rumor = p.clues.find((c) => c.fact_key === "rumor")!;
    expect(secret.audience).toBe("gm_only");
    expect(rumor.audience).toBe("discoverable");
    expect(rumor.points_to).toContain("revelation:secret");
    expect(p.revelations[0]!.clue_keys).toContain("clue:rumor");
    expect(p.background.common_knowledge).not.toContain("king's brother");
  });
  it("carries rules-derived stats, antagonists and PCs", () => {
    const villain = p.npcs.find((n) => n.name === "Villain")!;
    expect(villain.role).toBe("antagonist");
    expect(villain.gurps?.st).toBe(12);
    expect(p.npcs.find((n) => n.name === "Hero")!.role).toBe("player_character");
    expect(p.encounters[0]!.npcs).not.toContain("Hero");
  });
  it("fits in a v1 manifest alongside older targets", () => {
    const manifest = adaptationManifestSchema.parse({
      format: "awd-campaign-adaptation",
      version: 1,
      exported_at: "2026-01-01T00:00:00Z",
      source_campaign: { campaign_id: "c", name: "C" },
      adaptation: { id: "a", name: "A", source_mode: "mixed", spoiler_policy: "include_gm_truth" },
      story_bible: {},
      scenes: input().scenes,
      targets: { adventure_module: module },
      sync: {},
    });
    expect(manifest.targets.book_narrative).toBeUndefined();
    expect(renderAdventureModuleMarkdown(module)).toContain("GURPS");
  });
});
