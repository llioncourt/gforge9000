import { describe, expect, it } from "vitest";

import { canonicalJson, hashValue, sha256Hex, stableHash, stableKey } from "@/lib/adaptation/hash";
import { allowedBySpoilerPolicy, deriveKnowledgeState } from "@/lib/adaptation/spoilers";
import {
  diffSources,
  planSceneUpdates,
  toSourceMap,
  isEmptyChangeSet,
} from "@/lib/adaptation/diff";
import { dedupeByHash, resolveAssets, resolverStats } from "@/lib/adaptation/assets";
import {
  adaptationManifestSchema,
  adaptationSceneSchema,
  isSafeBundlePath,
  parseAdaptationManifest,
  referencedFiles,
  validateAdaptationManifest,
  type AdaptationManifest,
} from "@/lib/adaptation/protocol";
import { buildComicProjection, buildMovieProjection } from "@/lib/adaptation/projections";
import { buildScanSnapshot, expandBranch, type ScanRecord } from "@/lib/adaptation/scanner";
import {
  applyConflicts,
  buildContextChunks,
  toDraftFacts,
  toDraftScenes,
} from "@/lib/adaptation/pipeline";

// ------------------------------------------------------------------ hashing

describe("hashing and stable keys", () => {
  it("canonical JSON ignores key order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
  });

  it("hashes are deterministic and differ on change", () => {
    expect(hashValue({ a: 1 })).toBe(hashValue({ a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
    expect(stableHash("abc")).toHaveLength(32);
  });

  it("stable keys survive re-scans of the same source", () => {
    expect(stableKey("entity", "id-1")).toBe(stableKey("entity", "id-1"));
    expect(stableKey("entity", "id-1")).not.toBe(stableKey("entity", "id-2"));
  });

  it("sha256 fingerprints binary content", async () => {
    const hash = await sha256Hex(new TextEncoder().encode("hello"));
    expect(hash).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  });
});

// --------------------------------------------------------------- knowledge

describe("knowledge state and spoilers", () => {
  it("never claims knowledge the campaign does not record", () => {
    const state = deriveKnowledgeState({ visibility: "GM_ONLY", gmOnly: true });
    expect(state.player_knowledge).toBe("unrevealed");
    expect(state.character_knowledge).toBe("unknown");
    expect(state.revealed).toBe(false);
  });

  it("treats an explicit grant as revealed to that player only", () => {
    const state = deriveKnowledgeState({ visibility: "SELECTED_PLAYERS", grantedUserIds: ["u1"] });
    expect(state.revealed).toBe(true);
    expect(state.revealed_to).toEqual(["u1"]);
    expect(state.player_knowledge).toBe("revealed");
  });

  it("marks shared records as player knowledge", () => {
    expect(deriveKnowledgeState({ visibility: "ALL_PLAYERS" }).player_knowledge).toBe(
      "player_knowledge",
    );
  });

  it("revealed_only hides unrevealed secrets and keeps open records", () => {
    expect(allowedBySpoilerPolicy("revealed_only", { revealed: false }, true)).toBe(false);
    expect(allowedBySpoilerPolicy("revealed_only", { revealed: true }, true)).toBe(true);
    expect(allowedBySpoilerPolicy("revealed_only", { revealed: false }, false)).toBe(true);
    expect(allowedBySpoilerPolicy("include_gm_truth", { revealed: false }, true)).toBe(true);
  });
});

// -------------------------------------------------------------------- diff

describe("scan diff and sync", () => {
  const previous = toSourceMap([
    { source_key: "a", source_type: "entity", source_hash: "1", label: "A" },
    { source_key: "b", source_type: "entity", source_hash: "1", label: "B" },
  ]);
  const next = toSourceMap([
    { source_key: "a", source_type: "entity", source_hash: "1", label: "A" },
    { source_key: "b", source_type: "entity", source_hash: "2", label: "B" },
    { source_key: "c", source_type: "entity", source_hash: "1", label: "C" },
  ]);

  it("reports added, changed and removed", () => {
    const set = diffSources(previous, next);
    expect(set.added.map((e) => e.source_key)).toEqual(["c"]);
    expect(set.changed.map((e) => e.source_key)).toEqual(["b"]);
    expect(set.removed).toEqual([]);
    expect(set.unchanged).toBe(1);
    expect(isEmptyChangeSet(set)).toBe(false);
  });

  it("is empty when nothing moved", () => {
    expect(isEmptyChangeSet(diffSources(previous, previous))).toBe(true);
  });

  it("maps a change onto the scenes that depend on it", () => {
    const set = diffSources(previous, next, [
      {
        stable_key: "scene:1",
        kind: "scene",
        source_refs: [{ source_type: "entity", source_key: "b" }],
      },
      {
        stable_key: "fact:1",
        kind: "fact",
        source_refs: [{ source_type: "entity", source_key: "b" }],
      },
    ]);
    const impact = set.impact.find((entry) => entry.source_key === "b");
    expect(impact?.scene_keys).toEqual(["scene:1"]);
    expect(impact?.fact_keys).toEqual(["fact:1"]);
    expect(impact?.movie_scenes).toBe(1);
  });

  it("never silently overwrites a hand-edited scene", () => {
    const plan = planSceneUpdates(
      [
        { stable_key: "s1", manually_edited: true, content_hash: "x" },
        { stable_key: "s2", manually_edited: false, content_hash: "y" },
      ],
      new Set(["s1", "s2"]),
    );
    expect(plan.find((p) => p.stable_key === "s1")?.action).toBe("conflict");
    expect(plan.find((p) => p.stable_key === "s2")?.action).toBe("update");
  });
});

// ------------------------------------------------------------------ assets

describe("asset resolver", () => {
  const entities = [
    { id: "e1", name: "Joseph", aliases: ["Joe"], kind: "NPC" },
    { id: "e2", name: "River House", aliases: [], kind: "LOCATION" },
    { id: "e3", name: "Joseph", aliases: [], kind: "NPC" },
  ];

  it("prefers explicit links and marks them resolved and canonical", () => {
    const [asset] = resolveAssets(
      [
        {
          source_kind: "portrait",
          source_id: "c1",
          title: "whatever",
          bucket: "portraits",
          storage_path: "a/b.avif",
          media_type: "image/avif",
          byte_size: 10,
          explicit_entity_id: "e2",
        },
      ],
      entities,
    );
    expect(asset?.resolution_status).toBe("resolved");
    expect(asset?.suggested_by).toBe("explicit");
    expect(asset?.is_canonical).toBe(true);
    expect(asset?.role).toBe("location");
  });

  it("treats a name match as a suggestion, never a resolution", () => {
    const [asset] = resolveAssets(
      [
        {
          source_kind: "asset",
          source_id: "a1",
          title: "River House",
          bucket: "lore",
          storage_path: "x/y.avif",
          media_type: "image/avif",
          byte_size: 1,
        },
      ],
      entities,
    );
    expect(asset?.resolution_status).toBe("ambiguous");
    expect(asset?.suggested_by).toBe("ai");
    expect(asset?.canonical_entity_id).toBeNull();
  });

  it("flags a name shared by two entities as ambiguous with both matches", () => {
    const [asset] = resolveAssets(
      [
        {
          source_kind: "asset",
          source_id: "a2",
          title: "Joseph",
          bucket: "lore",
          storage_path: "x/z.avif",
          media_type: "image/avif",
          byte_size: 1,
        },
      ],
      entities,
    );
    expect(asset?.matches).toEqual(["e1", "e3"]);
  });

  it("counts resolution and missing visuals", () => {
    const resolved = resolveAssets(
      [
        {
          source_kind: "portrait",
          source_id: "c1",
          title: "p",
          bucket: "portraits",
          storage_path: "a.avif",
          media_type: "image/avif",
          byte_size: 1,
          explicit_entity_id: "e1",
        },
        {
          source_kind: "asset",
          source_id: "a1",
          title: "nothing here",
          bucket: "lore",
          storage_path: "b.avif",
          media_type: "image/avif",
          byte_size: 1,
        },
      ],
      entities,
    );
    const stats = resolverStats(resolved, entities);
    expect(stats.resolved).toBe(1);
    expect(stats.unresolved).toBe(1);
    expect(stats.missingVisuals).toEqual(["e2", "e3"]);
  });

  it("drops byte-identical duplicates", () => {
    expect(dedupeByHash([{ sha256: "a" }, { sha256: "a" }, { sha256: "b" }])).toHaveLength(2);
  });
});

// ----------------------------------------------------------------- scanner

describe("scan snapshot", () => {
  const records: ScanRecord[] = [
    { source_type: "entity", source_id: "e1", label: "A", gm_only: false, payload: { name: "A" } },
    { source_type: "entity", source_id: "e2", label: "B", gm_only: true, payload: { name: "B" } },
  ];

  it("is stable for identical input and changes when a record changes", () => {
    const first = buildScanSnapshot("c1", "Camp", records);
    const again = buildScanSnapshot("c1", "Camp", records);
    expect(first.snapshot_hash).toBe(again.snapshot_hash);

    const edited = buildScanSnapshot("c1", "Camp", [
      records[0]!,
      { ...records[1]!, payload: { name: "B2" } },
    ]);
    expect(edited.snapshot_hash).not.toBe(first.snapshot_hash);
    expect(edited.stats["entity"]).toBe(2);
  });

  it("expands a story branch into every descendant", () => {
    const tree = [
      { id: "arc", parent_id: null },
      { id: "adv", parent_id: "arc" },
      { id: "chap", parent_id: "adv" },
      { id: "other", parent_id: null },
    ];
    expect(expandBranch(tree, ["arc"]).sort()).toEqual(["adv", "arc", "chap"]);
  });
});

// ---------------------------------------------------------------- pipeline

describe("pipeline mapping", () => {
  const snapshot = buildScanSnapshot("c1", "Camp", [
    {
      source_type: "entity",
      source_id: "e1",
      label: "Joseph",
      gm_only: false,
      payload: { name: "Joseph", aliases: ["Joe"], visibility: "ALL_PLAYERS" },
    },
    {
      source_type: "entity",
      source_id: "e2",
      label: "River House",
      gm_only: true,
      payload: { name: "River House", visibility: "GM_ONLY" },
    },
  ]);
  const josephKey = snapshot.sources.find((s) => s.label === "Joseph")!.source_key;

  it("omits secret material under revealed_only", () => {
    const open = buildContextChunks(snapshot, "include_gm_truth");
    const filtered = buildContextChunks(snapshot, "revealed_only");
    expect(open[0]?.source_keys).toHaveLength(2);
    expect(filtered[0]?.source_keys).toHaveLength(1);
  });

  it("splits oversized material into several chunks", () => {
    const chunks = buildContextChunks(snapshot, "include_gm_truth", 40);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.total === chunks.length)).toBe(true);
  });

  it("keeps a source reference on every extracted fact", () => {
    const facts = toDraftFacts(
      {
        facts: [
          {
            subject: "Joseph",
            subject_source_key: josephKey,
            fact_type: "history",
            statement: "Joseph forged the sword.",
            provenance_type: "campaign_canon",
            source_keys: [josephKey],
            confidence: 0.9,
            gm_only: false,
          },
        ],
      },
      snapshot,
    );
    expect(facts[0]?.source_refs[0]?.source_key).toBe(josephKey);
    expect(facts[0]?.subject_entity_id).toBe("e1");
    expect(facts[0]?.canon_status).toBe("needs_review");
  });

  it("marks both sides of a contradiction as a conflict", () => {
    const facts = toDraftFacts(
      {
        facts: [
          {
            subject: "Joseph",
            subject_source_key: josephKey,
            fact_type: "history",
            statement: "Joseph lives.",
            provenance_type: "campaign_canon",
            source_keys: [josephKey],
            confidence: 1,
            gm_only: false,
          },
          {
            subject: "Joseph",
            subject_source_key: josephKey,
            fact_type: "history",
            statement: "Joseph died.",
            provenance_type: "session_derived",
            source_keys: [josephKey],
            confidence: 0.8,
            gm_only: false,
          },
        ],
      },
      snapshot,
    );
    const marked = applyConflicts(facts, {
      conflicts: [
        {
          statement: "Joseph lives.",
          conflicting_statements: ["Joseph died."],
          source_keys: [josephKey],
          explanation: "",
        },
      ],
    });
    expect(marked.every((fact) => fact.provenance_type === "conflict")).toBe(true);
    expect(marked[0]?.conflict_with).toContain(marked[1]?.stable_key);
  });

  it("resolves cast names onto entity ids and hashes the scene body", () => {
    const scenes = toDraftScenes(
      {
        scenes: [
          {
            title: "The Forge",
            synopsis: "Sparks fly.",
            dramatic_goal: "Finish the blade.",
            sequence_no: 0,
            source_keys: [josephKey],
            cast: ["Joe"],
            location: "River House",
            props: [],
            beats: [
              { order: 0, description: "Hammer falls.", emotion: "tense", actors: ["Joseph"] },
            ],
            dialogue: [
              {
                order: 0,
                speaker: "Joseph",
                line: "Hold still.",
                delivery: null,
                balloon_type: "balloon",
              },
            ],
            narration: [],
            continuity: [{ key: "time_of_day", value: "night" }],
            provenance_type: "session_derived",
            gm_only: false,
          },
        ],
      },
      snapshot,
    );
    expect(scenes[0]?.cast_entity_ids).toEqual(["e1"]);
    expect(scenes[0]?.location_entity_id).toBe("e2");
    expect(scenes[0]?.content_hash).toHaveLength(32);
    expect(scenes[0]?.review_status).toBe("needs_review");
  });
});

// -------------------------------------------------------------- projections

const CAST = [
  {
    entity_id: "e1",
    key: "joseph",
    name: "Joseph",
    kind: "NPC",
    biography: "",
    visual_description: "",
    traits: [],
    asset_keys: ["asset:1"],
    source_refs: [],
    gm_only: false,
  },
];
const LOCATIONS = [
  {
    entity_id: "e2",
    key: "river-house",
    name: "River House",
    kind: "LOCATION",
    biography: "",
    visual_description: "",
    traits: [],
    asset_keys: [],
    source_refs: [],
    gm_only: false,
  },
];

function scene(index: number) {
  return {
    stable_key: `scene:${index}`,
    sequence_no: index,
    title: `Scene ${index}`,
    synopsis: "Something happens.",
    dramatic_goal: "Move forward.",
    story_beats: [
      { order: 0, description: "Beat one", emotion: "calm", entity_ids: ["e1"] },
      { order: 1, description: "Beat two", emotion: null, entity_ids: [] },
    ],
    dialogue: [
      {
        order: 0,
        speaker: "Joseph",
        speaker_entity_id: "e1",
        line: "Hi",
        delivery: null,
        balloon_type: "balloon",
      },
      {
        order: 1,
        speaker: "Joseph",
        speaker_entity_id: "e1",
        line: "Think",
        delivery: null,
        balloon_type: "thought",
      },
    ],
    narration: [{ order: 0, text: "Later…", placement: "caption" }],
    cast_entity_ids: ["e1"],
    location_entity_id: "e2",
    prop_entity_ids: [],
    wardrobe_refs: [],
    continuity_state: { time_of_day: "night" },
    source_refs: [{ source_type: "entity", source_key: "k1" }],
    provenance_type: "session_derived" as const,
    review_status: "confirmed" as const,
    content_hash: "h",
    gm_only: false,
  };
}

const PROJECTION_INPUT = {
  scenes: [scene(0), scene(1)],
  cast: CAST,
  locations: LOCATIONS,
  props: [],
  wardrobe: [],
  storyBible: {
    logline: "A blade is forged.",
    synopsis: "Long version.",
    themes: ["duty"],
    tone: "grim",
    genre: ["fantasy"],
    setting: "Nadrel",
    timeline_summary: "",
  },
};

describe("scene schema", () => {
  it("accepts narration placement notes longer than 40 characters", () => {
    const s = scene(0);
    s.narration = [
      {
        order: 0,
        text: "Later…",
        placement:
          "Open the chapter with this caption directly above the wide establishing panel of the river crossing",
      },
    ];
    const parsed = adaptationSceneSchema.safeParse(s);
    expect(parsed.success).toBe(true);
  });
});

describe("comic projection", () => {
  it("packs beats into pages and keeps every panel", () => {
    const projection = buildComicProjection(PROJECTION_INPUT, {
      series_title: "Chronicles",
      issue_number: 1,
      issue_title: "First",
      density: "standard",
      genre: ["fantasy"],
      art_direction: "ink",
      page_target: null,
    });
    const pages = projection.target_projection.pages;
    const panels = pages.flatMap((page) => page.panels);
    expect(panels).toHaveLength(4);
    expect(projection.target_projection.manifest_kind).toBe("rx-comics-v2-manifest");
    expect(panels[0]?.characters).toEqual(["Joseph"]);
    expect(panels[0]?.location).toBe("River House");
    expect(pages.every((page) => page.panels[0]?.panel_no === 1)).toBe(true);
  });

  it("honours a requested page count", () => {
    const projection = buildComicProjection(PROJECTION_INPUT, {
      series_title: "Chronicles",
      issue_number: 1,
      issue_title: "First",
      density: "sparse",
      genre: [],
      art_direction: "",
      page_target: 2,
    });
    expect(projection.target_projection.pages).toHaveLength(2);
  });
});

describe("movie projection", () => {
  it("produces one scene per adapted scene with a materialisable pack seed", () => {
    const projection = buildMovieProjection(PROJECTION_INPUT, {
      title: "The Blade",
      logline: "",
      aspect_ratio: "16:9",
      language: "en",
      style: {},
      runtime_target_minutes: 90,
    });
    const scenes = projection.target_projection.scenes;
    expect(projection.target_projection.format).toBe("moviesmith.movie.v1");
    expect(scenes).toHaveLength(2);
    expect(scenes[0]?.slugline).toContain("RIVER HOUSE");
    expect(scenes[0]?.slugline).toContain("NIGHT");
    expect(scenes[0]?.pack_seed.format).toBe("moviesmith.pack.v2");
    expect(scenes[0]?.pack_seed.cuts).toHaveLength(2);
    // Thought balloons must not be lip-synced.
    const tts = scenes[0]!.pack_seed.cuts.flatMap((cut) => cut.tts);
    expect(tts.find((line) => line.line === "Think")?.lipsync).toBe(false);
  });
});

// ---------------------------------------------------------------- protocol

function manifestFixture(): AdaptationManifest {
  return adaptationManifestSchema.parse({
    format: "awd-campaign-adaptation",
    version: 1,
    exported_at: "2026-01-01T00:00:00.000Z",
    source_campaign: { campaign_id: "c1", name: "Camp", revision: "r1" },
    adaptation: {
      id: "a1",
      name: "Retelling",
      source_mode: "mixed",
      spoiler_policy: "include_gm_truth",
    },
    story_bible: PROJECTION_INPUT.storyBible,
    facts: [
      {
        stable_key: "fact:1",
        statement: "Joseph forged the sword.",
        provenance_type: "campaign_canon",
        source_refs: [{ source_type: "entity", source_key: "k1" }],
        confidence: 1,
        canon_status: "confirmed",
        gm_only: false,
      },
    ],
    cast: CAST,
    locations: LOCATIONS,
    scenes: [scene(0)],
    assets: [
      {
        asset_key: "asset:1",
        file: "assets/character/joseph.avif",
        media_type: "image/avif",
        byte_size: 10,
        sha256: "a".repeat(64),
        role: "character",
        entity_id: "e1",
        is_canonical: true,
      },
    ],
    sync: { snapshot_hash: "h1" },
  });
}

describe("adaptation package v1", () => {
  it("round-trips through parse", () => {
    const manifest = manifestFixture();
    const parsed = parseAdaptationManifest(JSON.stringify(manifest));
    expect(parsed.format).toBe("awd-campaign-adaptation");
    expect(parsed.version).toBe(1);
  });

  it("rejects a manifest that is not valid JSON", () => {
    expect(() => parseAdaptationManifest("{nope")).toThrow(/not valid JSON/);
  });

  it("accepts a well-formed manifest", () => {
    expect(validateAdaptationManifest(manifestFixture())).toEqual([]);
  });

  it("lists the files the bundle must contain", () => {
    expect(referencedFiles(manifestFixture())).toEqual(["assets/character/joseph.avif"]);
  });

  it("refuses a fact with no source", () => {
    const manifest = manifestFixture();
    manifest.facts[0]!.source_refs = [];
    expect(validateAdaptationManifest(manifest)).toContain(
      'Fact "fact:1" has no source reference.',
    );
  });

  it("allows an adaptation-only fact without a source", () => {
    const manifest = manifestFixture();
    manifest.facts[0]!.source_refs = [];
    manifest.facts[0]!.provenance_type = "adaptation_created";
    expect(validateAdaptationManifest(manifest)).toEqual([]);
  });

  it("catches the same file bundled twice", () => {
    const manifest = manifestFixture();
    manifest.assets.push({
      ...manifest.assets[0]!,
      asset_key: "asset:2",
      file: "assets/character/copy.avif",
    });
    expect(validateAdaptationManifest(manifest).join(" ")).toMatch(
      /duplicate the same file content/,
    );
  });

  it("catches a bible record pointing at a missing file", () => {
    const manifest = manifestFixture();
    manifest.cast[0]!.asset_keys = ["asset:missing"];
    expect(validateAdaptationManifest(manifest).join(" ")).toMatch(/unknown asset/);
  });

  it("rejects unsafe bundle paths", () => {
    expect(isSafeBundlePath("assets/a.png")).toBe(true);
    expect(isSafeBundlePath("../escape.png")).toBe(false);
    expect(isSafeBundlePath("assets/../../escape.png")).toBe(false);
    expect(isSafeBundlePath("/etc/passwd")).toBe(false);
    expect(isSafeBundlePath("C:/win.png")).toBe(false);
    expect(isSafeBundlePath("assets\\win.png")).toBe(false);
  });
});
