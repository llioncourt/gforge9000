import {
  MAX_CAMPAIGN_PACKAGE_BYTES,
  NOTE_KINDS,
  GRID_TYPES,
  VISIBILITIES,
} from "@/lib/campaign-package";

const MAX_MB = Math.round(MAX_CAMPAIGN_PACKAGE_BYTES / (1024 * 1024));

export const CAMPAIGN_PACKAGE_EXAMPLE = `{
  "format": "ucf-campaign-package",
  "version": 1,
  "campaign": {
    "name": "Ashes of the Frontier",
    "description": "A frontier colony runs out of air, money and friends.",
    "settings": {
      "point_limit": 150,
      "disadvantage_limit": -50,
      "quirk_limit": -5,
      "tech_level": 9,
      "house_rules": "No cinematic skills.",
      "allowed_sources": ["user"]
    }
  },
  "notes": [
    { "kind": "session-prep", "title": "Session 1", "body": "Open on the landing pad.", "gm_only": true }
  ],
  "lore": {
    "entities": [
      {
        "key": "location:colony",
        "kind": "location",
        "name": "Ferrous Colony",
        "visibility": "players",
        "summary": "A mining colony on a dying moon.",
        "tags": ["hub"]
      },
      {
        "key": "npc:sergeant-vale",
        "kind": "npc",
        "name": "Sergeant Vale",
        "parent_key": "location:colony",
        "visibility": "gm",
        "gm_notes": "Secretly on the syndicate payroll.",
        "image_file": "images/vale.jpg",
        "character_key": "char:vale"
      }
    ],
    "relationships": [
      {
        "source_key": "npc:sergeant-vale",
        "target_key": "location:colony",
        "rel_type": "stationed-at",
        "visibility": "players"
      }
    ]
  },
  "assets": [
    { "title": "Colony handout", "file": "assets/colony-map.png", "visible_to_players": true, "tags": ["handout"] }
  ],
  "maps": [
    {
      "name": "Landing pad",
      "file": "maps/landing-pad.png",
      "grid_type": "hex",
      "grid_size": 64,
      "unit_per_cell": 1,
      "unit_name": "yd",
      "is_active": true,
      "visible_to_players": true,
      "objects": [
        { "kind": "token", "label": "Sergeant Vale", "x": 3, "y": 4, "size": 1, "entity_key": "npc:sergeant-vale" }
      ]
    }
  ],
  "videos": [
    { "title": "Welcome to the Frontier", "type": "intro", "file": "videos/intro.mp4" },
    { "title": "Previously on…", "type": "recap", "file": "videos/recap-01.mp4" }
  ],
  "soundtracks": [
    {
      "slug": "ashes-of-the-frontier",
      "title": "Ashes of the Frontier",
      "composer": "Jane Doe",
      "release_year": 2026,
      "cover": "soundtracks/cover.jpg",
      "tracks": [
        { "position": 1, "title": "Dust and Iron", "duration_seconds": 184, "file": "soundtracks/01-dust-and-iron.mp3" }
      ]
    }
  ],
  "sound_fx": [
    { "title": "Airlock alarm", "file": "sound-fx/airlock-alarm.ogg" }
  ],
  "characters": [
    { "key": "char:vale", "file": "characters/sergeant-vale.json", "portrait_file": "images/vale.jpg", "is_npc": true }
  ]
}
`;

export function buildCampaignPackageReadme() {
  return `# Campaign package format (UCF-CAMPAIGN v1)

A campaign package is a single ZIP file you drop on the **New campaign** dialog.
Importing it creates a brand new campaign owned by you and fills in everything
the campaign screens can hold: premise and house rules, lore, notes and session
prep, assets, battle maps and tokens, videos, soundtrack albums, sound effects and
character sheets.

Maximum package size: ${MAX_MB} MB.

## ZIP layout

\`\`\`
my-campaign.zip
├── campaign.json           (required, at the ZIP root)
├── images/                 (entity photos — any image format)
├── assets/                 (handouts: images or PDF)
├── maps/                   (battle map images)
├── videos/                 (Intro, Recap, Cutscene and other MP4 videos)
├── soundtracks/            (cover image + audio tracks)
├── sound-fx/               (one-shot audio effects)
└── characters/*.json       (character exports)
\`\`\`

Folder names are free: every file is referenced by its exact path inside the ZIP
from \`campaign.json\`. All images are converted to AVIF automatically on import.

## campaign.json

Top level keys:

| Key | Required | What it is |
| --- | --- | --- |
| \`format\` | yes | Must be \`"ucf-campaign-package"\` |
| \`version\` | yes | Must be \`1\` |
| \`campaign\` | yes | Name, premise and table settings |
| \`notes\` | no | Notes, handout text, session and session-prep entries |
| \`lore\` | no | Entities and the relationships between them |
| \`assets\` | no | Files shown on the Assets tab |
| \`maps\` | no | Battle maps and their tokens |
| \`videos\` | no | Typed videos shown in Media > Videos |
| \`soundtracks\` | no | Albums played by the persistent campaign music player |
| \`sound_fx\` | no | One-shot sounds the GM can play for everyone |
| \`intro\` | no | Legacy Intro field; use \`videos\` for new packages |
| \`characters\` | no | Character sheets added to the roster |

Unknown keys are rejected so typos surface immediately instead of silently
dropping content.

### campaign

\`\`\`jsonc
"campaign": {
  "name": "Ashes of the Frontier",       // required, up to 120 chars
  "description": "The premise players read on the campaign page.",
  "settings": {
    "point_limit": 150,
    "disadvantage_limit": -50,           // zero or negative
    "quirk_limit": -5,                   // optional; usually negative
    "tech_level": 9,
    "house_rules": "Free text shown on the House rules panel.",
    "allowed_sources": ["user"]          // content packs enabled for the table
  }
}
\`\`\`

### notes

One entry per note. \`kind\` is one of ${NOTE_KINDS.map((k) => `\`${k}\``).join(", ")}.
\`gm_only: true\` keeps it hidden from players.

### lore

\`lore.entities\` is the campaign's world: NPCs, locations, factions, items,
timeline events, story beats — every kind the Lore tab offers. Each entity needs
a \`key\` that is unique inside the package; other sections point at entities
using that key (the key itself is not stored, it only wires the file together).

\`\`\`jsonc
{
  "key": "npc:sergeant-vale",   // unique within this package
  "kind": "npc",                // any kind the Lore tab supports
  "name": "Sergeant Vale",
  "status": "active",
  "visibility": "gm",           // ${VISIBILITIES.map((v) => `"${v}"`).join(" | ")}
  "summary": "One line seen in lists.",
  "player_description": "What players may read.",
  "description": "Full write-up.",
  "gm_notes": "Secrets.",
  "aliases": ["The Sergeant"],
  "tags": ["law"],
  "parent_key": "location:colony",  // nests this entity under another
  "image_file": "images/vale.jpg",  // photo inside the ZIP
  "character_key": "char:vale",     // links to a character sheet in this package
  "sort_order": 0,
  "data": { "role": "Colony security" }  // kind-specific fields
}
\`\`\`

\`lore.relationships\` connects two entities:

\`\`\`jsonc
{
  "source_key": "npc:sergeant-vale",
  "target_key": "location:colony",
  "rel_type": "stationed-at",
  "description": "Public version.",
  "gm_description": "Hidden version.",
  "strength": 2,          // -5 to 5
  "is_current": true,
  "visibility": "players"
}
\`\`\`

### assets

\`\`\`jsonc
{ "title": "Colony handout", "caption": "Shown to players in session 2",
  "tags": ["handout"], "visible_to_players": true, "file": "assets/colony-map.png" }
\`\`\`

PNG, JPEG, WebP, AVIF, GIF or PDF, up to 25 MB each.

### maps

\`\`\`jsonc
{
  "name": "Landing pad",
  "file": "maps/landing-pad.png",   // optional; a map can start blank
  "grid_type": "hex",               // ${GRID_TYPES.map((g) => `"${g}"`).join(" | ")}
  "grid_size": 64,                  // pixels per cell on the image
  "grid_offset_x": 0,
  "grid_offset_y": 0,
  "unit_per_cell": 1,
  "unit_name": "yd",
  "is_active": true,                // the map opened by default
  "visible_to_players": true,
  "objects": [
    {
      "kind": "token",
      "label": "Sergeant Vale",
      "x": 3, "y": 4,               // grid cell coordinates
      "size": 1,                    // in cells
      "rotation": 0,
      "color": "#c2410c",
      "hidden": false,
      "entity_key": "npc:sergeant-vale",   // token art + sheet link
      "character_key": "char:vale",
      "image_file": "images/vale.jpg"      // overrides the art
    }
  ]
}
\`\`\`

### Media: Videos

Videos must be MP4. Supported types are \`intro\`, \`recap\`, \`cutscene\`,
\`trailer\`, \`handout\`, \`vision\`, \`dream\`, and \`other\`. A package may
contain only one \`intro\`; it is the only type that blocks first entry until it
finishes. All other videos are optional and can be played from Media > Videos.

\`"videos": [{ "title": "Welcome", "type": "intro", "file": "videos/intro.mp4" }]\`

### Media: Soundtracks

One object per album; audio must be MP3, OGG, Opus or M4A, and track positions
must start at 1 with no gaps. The cover may be any image format.

\`\`\`jsonc
{
  "slug": "ashes-of-the-frontier",   // lowercase letters, numbers, hyphens
  "title": "Ashes of the Frontier",
  "subtitle": "Original campaign score",
  "description": "Ambient and combat cues.",
  "composer": "Jane Doe",
  "release_year": 2026,
  "cover": "soundtracks/cover.jpg",
  "tracks": [
    { "position": 1, "title": "Dust and Iron", "composer": "Jane Doe",
      "duration_seconds": 184, "file": "soundtracks/01-dust-and-iron.mp3" }
  ]
}
\`\`\`

### Media: Sound FX

Each entry is a one-shot sound the GM can trigger for everyone currently in the
campaign. Supported files are MP3, OGG, Opus, M4A, WAV, and WebM, up to 40 MB.
Sound FX do not appear in the persistent soundtrack player.

\`"sound_fx": [{ "title": "Airlock alarm", "file": "sound-fx/alarm.ogg" }]\`

### Legacy intro

\`"intro": { "file": "intro/intro.mp4" }\` remains accepted for older v1 packages.
New packages should use a \`videos\` entry with \`"type": "intro"\` instead. Do
not include both forms in the same package.

### characters

Each entry points at a character JSON exported from this app (the
\`universal-character-forge\` export on a character page):

\`\`\`jsonc
{ "key": "char:vale", "file": "characters/sergeant-vale.json",
  "portrait_file": "images/vale.jpg", "is_npc": true }
\`\`\`

Imported sheets belong to you and are attached to the new campaign. The game
master can hand a sheet to a player afterwards from the Roster tab.

## What is never imported

- Player accounts and memberships — invite codes are how people join.
- Per-player knowledge grants, notifications and dice roll history.
- Revision history of characters and lore entries.

These are tied to the accounts of the original table, so a package stays
portable between installs and people.

## Errors

The importer validates the whole package before writing anything: a missing
file, an unknown key, a broken \`parent_key\` or a gap in track positions stops
the import and tells you exactly which entry is wrong.
`;
}
