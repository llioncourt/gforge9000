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

| Field | Meaning |
| --- | --- |
| `format`, `version` | Always `awd-campaign-adaptation` / `1`. |
| `exported_at` | ISO timestamp. |
| `source_campaign` | `campaign_id`, `name`, `revision` (the scan hash), and the UCF package format/version this campaign also exports as. |
| `adaptation` | `id`, `name`, `source_mode`, `spoiler_policy`, `source_scope`, `creative_settings`. |
| `story_bible` | Logline, synopsis, themes, tone, genre, setting, timeline summary. |
| `facts` | Every reviewable statement, with provenance and sources. |
| `conflicts` | Statements the sources disagree about. Never auto-resolved. |
| `cast`, `locations`, `props`, `wardrobe` | Bible records with biography, visual description, traits and asset keys. |
| `scenes` | The adapted scenes in order. |
| `assets` | Asset manifest: path, media type, size, SHA-256, role, entity link. |
| `targets` | `comic` and/or `movie` projections (below). |
| `sync` | Source fingerprints, scene hashes and target mapping hints. |

### Provenance

Every fact and scene has `provenance_type`, one of:

| Value | Meaning |
| --- | --- |
| `campaign_canon` | Stated outright in a campaign record. |
| `session_derived` | Taken from what happened at the table. |
| `ai_inference` | Inferred by the reconstruction pipeline. Always reviewed before export. |
| `adaptation_created` | Invented for this retelling. Never campaign truth. |
| `conflict` | Sources disagree. |

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

## Sync

`sync.sources[]` lists `source_key`, `source_type`, `source_id`, `source_hash`
and a label for every campaign record the adaptation was built from;
`sync.scene_hashes` maps each scene's stable key to its content hash.

Re-scanning the campaign later produces a new source map. Comparing the two maps
yields added, changed and removed sources, and the impact list names the scenes
and facts each change touches. Scenes edited by hand are reported as conflicts
rather than overwritten.

---

## Validation

`parseAdaptationManifest` validates the JSON shape; `validateAdaptationManifest`
adds the cross-checks the shape alone cannot express: duplicate keys, duplicate
scene order, facts citing unknown conflicts, facts with no source, references to
unknown assets or scenes, and files whose content is bundled twice.
`referencedFiles` lists every path the manifest expects, for a pre-flight check
against the ZIP.
