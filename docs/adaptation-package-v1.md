# AWD Campaign Adaptation package — version 1

`format: "awd-campaign-adaptation"`, `version: 1`.

A ZIP with `adaptation.json` at its root plus the binary files it references.

This artifact is **derived**. It does not replace the UCF campaign package
(`ucf-campaign-package` v1): a campaign package is the campaign itself, while an
adaptation package is one retelling of it, produced for a comic or a film. Every
fact and scene in an adaptation carries `source_refs` pointing back at the
campaign records it came from, and `source_campaign` names the campaign and the
scan revision it was built from.

---

## Layout

```
adaptation.zip
├── adaptation.json
├── README.md
└── assets/
    ├── character/…
    ├── location/…
    ├── prop/…
    ├── map/…
    └── reference/…
```

File paths are validated: no absolute paths, no `..` segments, no backslashes,
no drive letters. Identical files are stored once and referenced by every record
that needs them (deduplicated by SHA-256 of the content).

---

## Top level of `adaptation.json`

| Field                                    | Meaning                                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `format`, `version`                      | Always `awd-campaign-adaptation` / `1`.                                                                              |
| `exported_at`                            | ISO timestamp.                                                                                                       |
| `source_campaign`                        | `campaign_id`, `name`, `revision` (the scan hash), and the UCF package format/version this campaign also exports as. |
| `adaptation`                             | `id`, `name`, `source_mode`, `spoiler_policy`, `source_scope`, `creative_settings`.                                  |
| `story_bible`                            | Logline, synopsis, themes, tone, genre, setting, timeline summary.                                                   |
| `facts`                                  | Every reviewable statement, with provenance and sources.                                                             |
| `conflicts`                              | Statements the sources disagree about. Never auto-resolved.                                                          |
| `cast`, `locations`, `props`, `wardrobe` | Bible records with biography, visual description, traits and asset keys.                                             |
| `scenes`                                 | The adapted scenes in order.                                                                                         |
| `assets`                                 | Asset manifest: path, media type, size, SHA-256, role, entity link.                                                  |
| `targets`                                | Any combination of `comic`, `movie`, `book_narrative`, `adventure_module` (below).                                   |
| `sync`                                   | Source fingerprints, scene hashes and target mapping hints.                                                          |

### Provenance

Every fact and scene has `provenance_type`, one of:

| Value                | Meaning                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `campaign_canon`     | Stated outright in a campaign record.                                   |
| `session_derived`    | Taken from what happened at the table.                                  |
| `ai_inference`       | Inferred by the reconstruction pipeline. Always reviewed before export. |
| `adaptation_created` | Invented for this retelling. Never campaign truth.                      |
| `conflict`           | Sources disagree.                                                       |

`canon_status` / `review_status` is `confirmed`, `needs_review` or `rejected`.
Confidence is a number from 0 to 1. A fact that is not `adaptation_created`
must cite at least one source.

### Knowledge state

`knowledge_state` distinguishes world truth, GM knowledge, player knowledge,
character knowledge, and whether the item was revealed and to whom. When the
campaign holds no evidence either way the value is `unknown` — never a guess.

### Scenes

Each scene has `stable_key`, `sequence_no`, `title`, `synopsis`,
`dramatic_goal`, ordered `story_beats`, `dialogue` (speaker, line, delivery,
balloon type), `narration`, `cast_entity_ids`, `location_entity_id`,
`prop_entity_ids`, `wardrobe_refs`, `continuity_state`, `knowledge_state`,
`source_refs` and a `content_hash` used for change detection.

---

## Comic projection (`targets.comic`)

`target_system: "rx_comics"`. The payload lives under `target_projection` and is
semantically compatible with `rx-comics-v2-manifest` `1.0`:

- `series` — title, subtitle, synopsis, genre, art direction.
- `issue` — number, title, synopsis, optional page target, panel density.
- `characters`, `locations`, `props`, `wardrobe` — bible records.
- `pages[]` — `page_no`, the scenes each page draws on, a layout hint, and
  `panels[]` with shot, description, characters, location, props, wardrobe,
  emotions, dialogue (with balloon type), captions, SFX, visual direction and
  asset keys.
- `continuity`, `loadout_hints`.

No catalog slugs are invented here. Creative values stay semantic (plain names
and descriptions) so the RX adapter can validate and map them against its own
catalogs, which may evolve independently. Page count is not fixed: the wizard
sets a target and a density, and the generator fills complete, reviewable pages.

---

## Film projection (`targets.movie`)

`target_system: "moviesmith"`, `target_projection.format:
"moviesmith.movie.v1"` — a whole film, not a single scene:

- `movie` — title, logline, synopsis, runtime target, aspect ratio, language.
- `story_bible`, `cast`, `locations`, `props`, `wardrobe`, `style`.
- `scenes[]` — `scene_key`, `scene_no`, slugline, synopsis, location, time of
  day, cast, props, wardrobe, continuity, and a `pack_seed`.

`pack_seed` has `format: "moviesmith.pack.v2"` and carries `cuts[]` with shot,
duration, description, camera, actions, TTS lines (speaker, line, voice hint,
emotion, lipsync flag), SFX and music. A MovieSmith runner can therefore
decompose `moviesmith.movie.v1` into one existing pack v2 per scene without any
new conversion logic.

---

## Four targets, one reconstruction

```text
Campaign Adaptation master (scan, reconstruction, facts, canon, timeline, assets)
 -> comic            (targets.comic)
 -> movie            (targets.movie)
 -> book_narrative   (targets.book_narrative)
 -> adventure_module (targets.adventure_module)
```

Scan, reconstruction, facts, canon and assets are never duplicated per target.
The project stores `target_comic`, `target_movie`, `target_book_narrative` and
`target_adventure_module`; the two new flags default to `false`, so every
existing adaptation keeps exactly its previous selection.

### Shared narrative direction

`creative_settings.narrative` (tone, POV, audience, max scenes) is the shared
direction applied to every target. It is shown as "Narrative direction" and is
**not** the book target. The book targets have their own settings in
`creative_settings.book_narrative` and `creative_settings.adventure_module`.

---

## Narrative book projection (`targets.book_narrative`)

`target_system: "book"`, `target_projection.format: "awd.book.narrative.v1"`.
A literary novelization, not a play report.

- `front_matter` — title, subtitle, language, logline, synopsis and the shared
  tone / POV / audience.
- `structure` — `length_mode` (`auto` | `short_story` | `novella` | `novel`),
  `resolved_form`, `chapter_count`, optional `chapter_target` and `word_target`,
  `source_word_count`, and `reasons` (codes explaining the automatic choice:
  `few_scenes`, `moderate_scene_count`, `many_scenes`, `chapter_target`,
  `capped_by_scene_count`, `word_target`, `explicit_length_mode`).
- `chapters[]` — ordered; each has `key`, `title`, `summary`, `pov_character`,
  `scene_keys`, a proportional `word_target`, and `sections[]`. A `scene`
  section holds paragraphs (`narration`, `action`, `dialogue`) carrying the
  scene's provenance and `source_refs`. Chapters break preferably where the
  location changes.
- `transition` sections bridge a change of place inside a chapter. They are
  `adaptation_created`, `needs_review`, and carry a `writing_brief` (from/to
  scene and location, plus which scenes they must not contradict) instead of
  invented prose.
- `dramatis_personae`, `locations`, and `adaptation_notes` (`canon_preserved`,
  counts of reconstructed dialogue lines, created sections and unreviewed
  sections).

The standalone export also writes `book.md`, a readable draft.

---

## Adventure module projection (`targets.adventure_module`)

`target_system: "gurps"`, `format: "awd.adventure-module.gurps.v1"`,
`game_system: "gurps_4e"`, `adaptation_level: "complete_module"`.

Sections: `front_matter` (players, starting points, TL), `introduction`,
`overview`, `background` (`gm_truth` vs `common_knowledge`), `hooks`, `npcs`
(role `antagonist` | `ally` | `neutral` | `player_character`, with GURPS stat
blocks derived by the rules engine from linked character sheets),
`antagonist_keys`, `locations` (with map asset keys), `chronology`,
`getting_started`, `acts`, `encounters`, `clues`, `revelations`, `handouts`,
`appendices.fact_index`.

- **Not a railroad.** Every encounter has exactly one route with
  `original_table: true` (what the players actually did) plus alternative
  routes by approach (`social`, `stealth`, `force`, `investigation`,
  `evasion`) with suggested GURPS skill names. Alternatives are
  `adaptation_created` / `needs_review`; `modifier: null` means the GM sets it.
  Some routes skip ahead, so beats can be bypassed. Validation rejects an
  encounter whose only route is the original one.
- **Outcomes** per encounter: `success`, `partial`, `failure`, `skipped`, as
  machine-readable consequence codes (for example `clues_move_elsewhere:2`).
- **Knowledge separation.** GM-only facts become `revelations` and `gm_only`
  clues. Visible facts become clues with `audience: "discoverable"` when they
  point at a GM truth about the same subject, otherwise `player_facing`. Each
  clue lists `found_in` encounters, `reveal_conditions`, `if_missed` (another
  encounter that also holds it, or a GM fallback) and `revealed_in_original`.

The standalone export also writes `module.md`, a readable draft.

---

## Backward compatibility

The format stays `version: 1`. `targets.book_narrative` and
`targets.adventure_module` are optional additions: packages written before
them parse unchanged, and readers that only know comic/movie ignore them.

---

## Sync

`sync.sources[]` lists `source_key`, `source_type`, `source_id`, `source_hash`
and a label for every campaign record the adaptation was built from;
`sync.scene_hashes` maps each scene's stable key to its content hash.

Re-scanning the campaign later produces a new source map. Comparing the two maps
yields added, changed and removed sources, and the impact list names the scenes
and facts each change touches. Scenes edited by hand are reported as conflicts
rather than overwritten.

`sync.target_mapping_hints` also maps book chapters and module encounters
back to their scene keys.

---

## Validation

`parseAdaptationManifest` validates the JSON shape; `validateAdaptationManifest`
adds the cross-checks the shape alone cannot express: duplicate keys, duplicate
scene order, facts citing unknown conflicts, facts with no source, references to
unknown assets or scenes, and files whose content is bundled twice.
`referencedFiles` lists every path the manifest expects, for a pre-flight check
against the ZIP.
