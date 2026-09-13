import { MAX_SOUNDTRACK_COVER_BYTES, MAX_SOUNDTRACK_TRACK_BYTES, MAX_SOUNDTRACK_TRACKS, SOUNDTRACK_AUDIO_MIME } from "@/lib/campaign-soundtrack-pack";

const AUDIO_EXTENSIONS = Object.keys(SOUNDTRACK_AUDIO_MIME).join(", ");
const COVER_MB = Math.round(MAX_SOUNDTRACK_COVER_BYTES / (1024 * 1024));
const TRACK_MB = Math.round(MAX_SOUNDTRACK_TRACK_BYTES / (1024 * 1024));

export const SOUNDTRACK_EXAMPLE_MANIFEST = `{
  "packVersion": 1,
  "album": {
    "slug": "ashes-of-the-frontier",
    "title": "Ashes of the Frontier",
    "subtitle": "Original campaign score",
    "description": "Ambient and combat cues for a gritty frontier campaign.",
    "composer": "Jane Doe",
    "release_year": 2026,
    "game_slug": "ashes-of-the-frontier",
    "status": "published",
    "cover": "cover.avif"
  },
  "tracks": [
    {
      "position": 1,
      "title": "Dust and Iron",
      "composer": "Jane Doe",
      "duration_seconds": 184,
      "file": "tracks/01-dust-and-iron.mp3"
    },
    {
      "position": 2,
      "title": "The Long Watch",
      "composer": "Jane Doe",
      "duration_seconds": 212,
      "file": "tracks/02-the-long-watch.mp3"
    }
  ]
}
`;

export function buildSoundtrackPackReadme() {
  return `# Soundtrack package format

A soundtrack package is a single ZIP file you upload on the campaign Soundtrack tab.

## ZIP layout

\`\`\`
my-album.zip
├── album.json          (required, at the ZIP root)
├── cover.avif          (required, any image format, max ${COVER_MB} MB)
└── tracks/
    ├── 01-first-track.mp3
    └── 02-second-track.mp3
\`\`\`

## Rules

- \`album.json\` must sit at the root of the ZIP (not inside a folder).
- \`packVersion\` must be \`1\`.
- \`album.slug\` and \`album.game_slug\`: lowercase letters, numbers and hyphens only (2–80 characters).
- \`album.cover\` is the path inside the ZIP of the cover image. It must end in \`.avif\` and be at most ${COVER_MB} MB.
- Track \`position\` values must start at 1 and run without gaps (1, 2, 3, …), up to ${MAX_SOUNDTRACK_TRACKS} tracks.
- \`file\` is the path of the audio file inside the ZIP. Supported extensions: ${AUDIO_EXTENSIONS}.
- Each audio file must be at most ${TRACK_MB} MB.
- \`duration_seconds\` is an optional whole number of seconds (1–3600); it is only used for display.
- Optional fields may be omitted or set to \`null\`: \`subtitle\`, \`description\`, \`composer\`, \`release_year\`, \`game_slug\`, \`status\`, track \`composer\`, track \`duration_seconds\`, track \`lyrics\`.
- No extra top-level keys are allowed in \`album.json\`.

## Example album.json

\`\`\`json
${SOUNDTRACK_EXAMPLE_MANIFEST}\`\`\`

## Building the ZIP manually

1. Create a folder with \`album.json\`, the AVIF cover, and a \`tracks/\` folder with your audio files.
2. Convert the cover to AVIF if needed.
3. Zip the *contents* of the folder, so \`album.json\` ends up at the ZIP root.
4. Upload it on the campaign Soundtrack tab.
`;
}

export function buildSoundtrackPackPrompt() {
  return `I want you to prepare a soundtrack package ZIP for my tabletop campaign. Follow this specification exactly.

ZIP layout (album.json must be at the ZIP root, not inside a folder):
  album.json
  cover.avif
  tracks/01-....mp3, tracks/02-....mp3, ...

album.json schema (no extra keys allowed):
- packVersion: must be the number 1
- album.slug: lowercase letters, numbers and hyphens only, 2-80 chars
- album.title: 2-160 chars
- album.subtitle, album.description, album.composer: optional strings (max 200 / 4000 / 160 chars)
- album.release_year: optional integer 1970-2100
- album.game_slug: optional, same slug rules
- album.status: optional, "draft" or "published"
- album.cover: path inside the ZIP of the cover image; any common image format (converted to AVIF on import), max ${COVER_MB} MB
- tracks: array of 1-${MAX_SOUNDTRACK_TRACKS} items, each with:
  - position: integer starting at 1, consecutive with no gaps
  - title: 1-200 chars
  - composer: optional string
  - duration_seconds: optional integer 1-3600
  - file: path inside the ZIP of the audio file; extension must be one of ${AUDIO_EXTENSIONS}; max ${TRACK_MB} MB each
  - lyrics: optional string (max 200 chars)

Example album.json:
${SOUNDTRACK_EXAMPLE_MANIFEST}
Now ask me for the album title, composer, and the track list, then produce the final album.json and tell me exactly how to name and place each file before zipping.`;
}
