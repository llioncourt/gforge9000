/**
 * AI conversion guides.
 *
 * Each import surface in the app can hand the user a Markdown file that
 * explains — to another AI, alongside a source PDF — exactly how to produce a
 * valid import file for *that* importer.
 *
 * The JSON examples embedded in the guides are the fixtures below, so the docs
 * cannot drift from the parsers: tests parse every example with the real
 * parser from `@/lib/portable`.
 *
 * These guides document FORMAT only. They contain no rulebook content.
 */

export type GuideKind = "character" | "library" | "pack";

/* ---------- fixtures (each one must pass its parser) ---------- */

export const characterMinimalExample = {
  format: "universal-character-forge",
  version: 1,
  exported_at: "2026-01-01T00:00:00.000Z",
  character: {
    name: "Unnamed Recruit",
    point_budget: 100,
    tech_level: 8,
    st: 10,
    dx: 10,
    iq: 10,
    ht: 10,
    hp_delta: 0,
    will_delta: 0,
    per_delta: 0,
    fp_delta: 0,
    speed_delta: 0,
    move_delta: 0,
    conditions: [],
    wealth: "Average",
    status: 0,
  },
  entries: [],
};

export const characterRichExample = {
  format: "universal-character-forge",
  version: 1,
  exported_at: "2026-01-01T00:00:00.000Z",
  character: {
    name: "Wren Calloway",
    player_name: "Sam",
    concept: "Dock-side investigator",
    point_budget: 150,
    tech_level: 8,
    st: 11,
    dx: 12,
    iq: 12,
    ht: 11,
    hp_delta: 1,
    will_delta: 1,
    per_delta: 2,
    fp_delta: 0,
    speed_delta: 0,
    move_delta: 0,
    current_hp: 12,
    current_fp: 11,
    conditions: ["Shock -1"],
    wealth: "Average",
    status: 0,
    notes: "Converted from PDF, p. 14-17.",
    appearance: { height: "1.72 m", weight: "68 kg", age: "31", description: "Short dark hair." },
    is_npc: false,
    approved: false,
  },
  entries: [
    {
      kind: "advantage",
      name: "Quick Reflexes",
      category: "Mental",
      points: 5,
      levels: 1,
      notes: null,
      data: { modifiers: [], prerequisites: "" },
      source: { label: "My House Rules", edition: "1st", page: "14", type: "user" },
      sort_order: 0,
    },
    {
      kind: "skill",
      name: "Urban Navigation",
      category: "Exploration",
      points: 0,
      levels: 1,
      notes: null,
      data: { attribute: "IQ", difficulty: "A", points: 4, specialization: "City" },
      source: { label: "My House Rules", edition: "1st", page: "15", type: "user" },
      sort_order: 1,
    },
    {
      kind: "equipment",
      name: "Responder Vest",
      category: "Armour",
      points: 0,
      levels: 1,
      notes: null,
      data: {
        quantity: 1,
        weight: 8,
        cost: 300,
        carried: true,
        dr: 5,
        locations: ["Torso"],
        tl: 8,
      },
      source: { label: "My House Rules", edition: "1st", page: "16", type: "user" },
      sort_order: 2,
    },
    {
      kind: "equipment",
      name: "Service Pistol",
      category: "Weapons",
      points: 0,
      levels: 1,
      notes: null,
      data: {
        quantity: 1,
        weight: 2,
        cost: 400,
        carried: true,
        weapons: [
          {
            name: "Service Pistol",
            damage: "2d-1 pi",
            accuracy: "2",
            range: "150/1800",
            rof: "3",
            shots: "15+1(3)",
            bulk: "-2",
            recoil: "2",
            skill: "Guns (Pistol)",
          },
        ],
      },
      source: { label: "My House Rules", edition: "1st", page: "17", type: "user" },
      sort_order: 3,
    },
  ],
};

export const libraryExample = {
  format: "universal-character-forge-library",
  version: 1,
  exported_at: "2026-01-01T00:00:00.000Z",
  entries: [
    {
      kind: "advantage",
      name: "Sure-Footed",
      category: "Physical",
      summary: "Keeps balance on treacherous ground.",
      base_points: 1,
      cost_per_level: 0,
      max_levels: null,
      data: {},
      tags: ["movement"],
      pack: "Harbour Campaign Pack",
      source_label: "Harbour Campaign Notes",
      source_edition: "1st",
      source_page: "22",
      source_type: "user",
      visibility: "private",
    },
    {
      kind: "skill",
      name: "Rope Work",
      category: "Craft",
      summary: null,
      base_points: 1,
      cost_per_level: 1,
      max_levels: 4,
      data: { attribute: "DX", difficulty: "A", points: 1 },
      tags: [],
      pack: "Harbour Campaign Pack",
      source_label: "Harbour Campaign Notes",
      source_edition: "1st",
      source_page: "23",
      source_type: "user",
      visibility: "private",
    },
    {
      kind: "equipment",
      name: "Oilskin Coat",
      category: "Gear",
      summary: "Heavy waterproof coat.",
      base_points: 0,
      cost_per_level: 0,
      max_levels: null,
      data: { quantity: 1, weight: 4, cost: 50, carried: true },
      tags: ["clothing"],
      pack: null,
      source_label: "Harbour Campaign Notes",
      source_edition: "1st",
      source_page: "31",
      source_type: "user",
      visibility: "private",
    },
  ],
};

export const packExample = {
  format: "universal-character-forge-pack",
  version: 1,
  exported_at: "2026-01-01T00:00:00.000Z",
  pack: {
    name: "Harbour Campaign Pack",
    description: "House content for the harbour campaign.",
    source_label: "Harbour Campaign Notes",
    source_edition: "1st",
    source_type: "user",
    visibility: "private",
  },
  entries: [
    {
      kind: "advantage",
      name: "Sure-Footed",
      category: "Physical",
      summary: "Keeps balance on treacherous ground.",
      base_points: 1,
      cost_per_level: 0,
      max_levels: null,
      data: {},
      tags: ["movement"],
      pack: "Harbour Campaign Pack",
      source_label: "Harbour Campaign Notes",
      source_edition: "1st",
      source_page: "22",
      source_type: "user",
      visibility: "private",
    },
    {
      kind: "technique",
      name: "Quick Knot",
      category: "Craft",
      summary: null,
      base_points: 1,
      cost_per_level: 1,
      max_levels: 3,
      data: { attribute: "DX", difficulty: "A", points: 1, baseSkill: "Rope Work" },
      tags: [],
      pack: "Harbour Campaign Pack",
      source_label: "Harbour Campaign Notes",
      source_edition: "1st",
      source_page: "24",
      source_type: "user",
      visibility: "private",
    },
  ],
};

/* ---------- shared guide prose ---------- */

const json = (value: unknown) => "```json\n" + JSON.stringify(value, null, 2) + "\n```";

const COMMON_RULES = `## Your two inputs

1. This Markdown guide (the format specification).
2. A PDF supplied by the user containing the source material.

Read the PDF **completely** — every page, including tables, sidebars, footnotes
and appendices — and produce **one** import file in the exact format described
below.

## Non-negotiable rules

- The PDF is the only source of truth. Treat this guide as format specification, not content.
- Extract all content that maps to a supported field. Do not silently omit supported content.
- Never invent facts: no statistics, point costs, levels, modifiers, page numbers,
  prerequisites, descriptions or rule values that are absent from the PDF.
- When a supported optional field is genuinely absent, use the documented null/empty/default
  value below. Do not guess.
- Preserve provenance: source title/label, edition when identifiable, page number(s), source type.
- Preserve names and terminology exactly as written in the source. Normalise only where the
  schema requires it (for example a fixed \`kind\` value).
- Output the **raw JSON file only**: no markdown code fences, no commentary, no explanations,
  no JavaScript, no multiple files.
- UTF-8 encoding.
- Never include executable code, HTML, scripts, code-executing URLs, or unexpected keys meant
  to bypass validation.
- Never bypass DRM, logins or access restrictions. You only convert what the user supplied.
- The user is responsible for holding the rights to the supplied content. This guide is format
  tooling, not a content redistribution mechanism.
- If the PDF is scanned or image-based, read it visually / OCR it, and double-check ambiguous
  text before encoding it.
- If the PDF contains contradictory duplicates, keep the most clearly authoritative occurrence.
  Record the uncertainty only in a notes/summary field if the schema supports one. Never invent
  a resolution.

## About game content

Universal Character Forge ships no published rulebook content and there is no open SRD for
GURPS. It imports material the user is authorised to use. Do not copy proprietary prose,
tables or artwork beyond what the user legitimately supplies and owns the right to import.`;

const WORKFLOW = `## PDF conversion workflow

1. Inventory the PDF's relevant content (what is importable, what is narrative only).
2. Build a source-page map: concept -> page number, so provenance stays accurate.
3. Map each source concept onto a supported entity of this importer.
4. Populate the exact schema fields documented above.
5. Preserve useful unmapped detail in \`notes\` / \`summary\` / \`data\` only where semantically
   appropriate — never as fabricated mechanics.
6. Validate every object against the checklist below.
7. Emit exactly one raw JSON artifact.`;

const checklist = (format: string, extra: string[] = []) =>
  [
    `## Mandatory pre-delivery checklist`,
    ``,
    `Before returning the file, verify:`,
    ``,
    `- top-level \`format\` is exactly \`"${format}"\`;`,
    `- top-level \`version\` is exactly \`1\`;`,
    `- every required field is present;`,
    `- every \`kind\` / category value is one of the accepted values listed above;`,
    `- numeric fields are JSON numbers, never formatted strings ("3" is wrong, 3 is right);`,
    `- booleans are booleans, arrays are arrays, objects are objects;`,
    `- no \`NaN\`, no \`Infinity\`, no \`undefined\`;`,
    `- no duplicate records unless the source genuinely contains distinct records with the same name;`,
    `- provenance fields are populated wherever the source provides them;`,
    `- every referenced pack/name relationship is internally coherent;`,
    `- the document parses as JSON with no trailing commas or comments;`,
    ...extra.map((e) => `- ${e}`),
  ].join("\n");

const ENTRY_KINDS = [
  "advantage",
  "disadvantage",
  "perk",
  "quirk",
  "skill",
  "technique",
  "spell",
  "equipment",
  "language",
  "culture",
  "custom",
];

const DATA_FIELDS = `### \`data\` payloads the app understands

The \`data\` object is free-form JSON, but the rules engine reads these keys:

| Entry kind | Keys read by the app |
| --- | --- |
| skill, spell | \`attribute\` ("ST" \\| "DX" \\| "IQ" \\| "HT" \\| "Will" \\| "Per"), \`difficulty\` ("E" \\| "A" \\| "H" \\| "VH"), \`points\` (number), \`specialization\`, \`bonus\` (number), \`defaults\`, \`prerequisites\` |
| technique | the skill keys above plus \`baseSkill\` (string), \`defaultPenalty\` (number) |
| advantage, disadvantage, perk, quirk | \`modifiers\`: array of \`{ "name": string, "percent": number, "notes"?: string }\`, \`prerequisites\` (string), \`tags\` (string[]) |
| equipment | \`quantity\`, \`weight\`, \`cost\` (numbers), \`carried\` (boolean), \`tl\` (number), \`legality\`, \`container\`, \`dr\` (number), \`locations\` (string[]), \`weapons\` (array, below) |

Weapon modes inside \`data.weapons\` use string fields exactly as printed in the source:
\`{ "name", "damage", "reach", "parry", "accuracy", "range", "rof", "shots", "bulk", "recoil", "skill" }\`.
Copy damage expressions verbatim (for example \`"2d-1 pi"\` or \`"thr+1 cut"\`). The app resolves
dice expressions itself and reports ST-dependent damage as "not configured" until the user
installs a damage progression — that is expected, do not substitute numbers of your own.`;

/* ---------- guides ---------- */

function characterGuide(): string {
  return `# Universal Character Forge — convert a PDF into a CHARACTER import file

${COMMON_RULES}

## Target format

A single JSON object:

\`\`\`
{
  "format": "universal-character-forge",   // exact string, required
  "version": 1,                            // exact number, required
  "exported_at": "ISO-8601 timestamp",     // e.g. "2026-01-01T00:00:00.000Z"
  "character": { ... },                    // one character object
  "entries": [ ... ]                       // zero or more entry objects
}
\`\`\`

### The \`character\` object

Required numeric/array fields (always emit them):

| Field | Type | Default when absent from the PDF |
| --- | --- | --- |
| \`name\` | string | required — use the name printed in the source |
| \`point_budget\` | number | 100 |
| \`tech_level\` | number | 8 |
| \`st\`, \`dx\`, \`iq\`, \`ht\` | number | 10 |
| \`hp_delta\`, \`will_delta\`, \`per_delta\`, \`fp_delta\`, \`speed_delta\`, \`move_delta\` | number | 0 |
| \`conditions\` | string[] | \`[]\` |
| \`wealth\` | string | \`"Average"\` |
| \`status\` | number | 0 |

Optional fields (omit them entirely, or use \`null\`, when the PDF does not state them):

\`player_name\`, \`concept\`, \`notes\` (string or null); \`current_hp\`, \`current_fp\`
(number or null — leave out for a fresh character so the app derives full HP/FP);
\`appearance\` (a free-form object such as \`{ "height", "weight", "age", "description" }\`);
\`is_npc\`, \`approved\` (booleans, default \`false\`).

Secondary characteristics are **deltas**, not totals: the app computes HP, Will, Per, FP,
Basic Speed and Move from the primary attributes and adds the \`*_delta\` values. If the source
prints a total, subtract the computed base and store the difference. If you cannot do that
reliably, use 0 rather than guessing.

**Never include:** \`id\`, \`owner_id\`, \`campaign_id\`, \`created_at\`, \`updated_at\`,
\`is_template\`, \`gm_notes\`, or any key not listed above. The importer inserts the object as-is
and ownership/IDs are assigned by the app; fabricated IDs make the import fail.

**Portraits:** the importer does not accept image data. Do not add \`portrait_path\`, base64
images or image URLs. The user uploads the portrait in the app after importing.

### Entry objects

Each item of \`entries\` is:

\`\`\`
{
  "kind": "advantage",        // required, one of the kinds below
  "name": "Quick Reflexes",   // required
  "category": "Mental",       // string or null
  "points": 5,                // number — points spent on traits; use 0 for skills and equipment
  "levels": 1,                // number — level count, default 1
  "notes": null,              // string or null
  "data": { },                // object, see below (never null)
  "source": { },              // provenance object, see below
  "sort_order": 0             // number, display order
}
\`\`\`

Accepted \`kind\` values: ${ENTRY_KINDS.map((k) => `\`${k}\``).join(", ")}.
Anything that does not fit uses \`"custom"\`. Never invent a new kind.

Point representation: traits (advantage/disadvantage/perk/quirk/language/culture/custom) carry
their cost in the top-level \`points\` field (disadvantages and quirks are negative numbers).
Skills, techniques and spells carry their cost in \`data.points\` and leave top-level \`points\`
at 0. Equipment always uses \`points: 0\`.

${DATA_FIELDS}

### Provenance

\`source\` is \`{ "label": string, "edition": string, "page": string, "type": "user" | "community" | "licensed" | "official" }\`.
Use the PDF's title as \`label\`, its edition if printed, the page the entry came from as \`page\`,
and \`"user"\` as \`type\` unless the user tells you otherwise. Use \`""\` for parts the PDF does
not state — never invent a page number.

${WORKFLOW}

## Minimal valid example

${json(characterMinimalExample)}

## Richer valid example

${json(characterRichExample)}

${checklist("universal-character-forge", [
  "the character object contains no `id`, `owner_id` or `campaign_id`;",
  "no portrait/image data is present anywhere;",
  "skill-like entries put their cost in `data.points`, traits in top-level `points`;",
  "every entry has a `kind` from the accepted list.",
])}

Return the JSON file and nothing else.
`;
}

function libraryGuide(): string {
  return `# Universal Character Forge — convert a PDF into a LIBRARY import file

${COMMON_RULES}

## Target format

A single JSON object:

\`\`\`
{
  "format": "universal-character-forge-library",  // exact string, required
  "version": 1,                                   // exact number, required
  "exported_at": "2026-01-01T00:00:00.000Z",
  "entries": [ ... ]                              // required array, one object per library entry
}
\`\`\`

The library holds reusable content — traits, skills, techniques, spells, equipment — that the
user can later add to any character. A library file may mix entries from **several packs**, or
none: set each entry's \`pack\` independently.

### Library entry schema

Every entry object uses exactly these keys:

| Key | Type | Required | Default when absent |
| --- | --- | --- | --- |
| \`kind\` | string | yes (import fails without it) | — |
| \`name\` | string | yes (import fails without it) | — |
| \`category\` | string \\| null | no | \`null\` |
| \`summary\` | string \\| null | no | \`null\` |
| \`base_points\` | number | no | \`0\` |
| \`cost_per_level\` | number | no | \`0\` |
| \`max_levels\` | number \\| null | no | \`null\` |
| \`data\` | object | no | \`{}\` |
| \`tags\` | string[] | no | \`[]\` |
| \`pack\` | string \\| null | no | \`null\` (shown as personal/unpacked content) |
| \`source_label\` | string | no | \`"User created"\` |
| \`source_edition\` | string \\| null | no | \`null\` |
| \`source_page\` | string \\| null | no | \`null\` |
| \`source_type\` | string | no | \`"user"\` |
| \`visibility\` | string | no | \`"private"\` |

The importer keeps only these keys — anything else is discarded, so do not add extra keys.

Accepted \`kind\` values: ${ENTRY_KINDS.map((k) => `\`${k}\``).join(", ")}.

\`base_points\` is the cost of the first level; \`cost_per_level\` the cost of each level after
it (0 when the content has no levels); \`max_levels\` is \`null\` when unlimited or not stated.

\`source_type\` should be \`"user"\` for user-authored or user-supplied material, \`"community"\`,
\`"licensed"\` or \`"official"\` only when the user states that is the case. \`visibility\` should
stay \`"private"\` unless the user explicitly asks to share.

${DATA_FIELDS}

### Custom or house content

Content the user invented, or content whose official rules are not in the PDF, is perfectly
valid here: describe it in \`summary\` using the PDF's own wording, set \`base_points\` only if
the PDF states a cost, and leave mechanical \`data\` keys out when the source does not define
them. Never fabricate official rules to fill a gap.

${WORKFLOW}

## Valid multi-entry example

${json(libraryExample)}

${checklist("universal-character-forge-library", [
  "every entry has a non-empty `name` and a non-empty `kind` (the parser rejects the file otherwise);",
  "`entries` is an array, even for a single entry;",
  "no keys outside the table above.",
])}

Return the JSON file and nothing else.
`;
}

function packGuide(): string {
  return `# Universal Character Forge — convert a PDF into a PACK import file

${COMMON_RULES}

## Pack import vs library import

A **library** file is a loose bag of entries that may belong to different packs or none.
A **pack** file describes one named collection: it carries pack metadata and the importer
forces every entry's \`pack\` field to the pack's name. Use this format when the PDF represents
one coherent body of content (a supplement, a setting, a house-rules document).

Importing a pack only creates/updates **library** grouping. It never alters entries already
copied onto a character, and it does not enable the pack for a campaign — the GM does that in
the campaign's content-pack settings.

## Target format

\`\`\`
{
  "format": "universal-character-forge-pack",  // exact string, required
  "version": 1,                                // exact number, required
  "exported_at": "2026-01-01T00:00:00.000Z",
  "pack": { ... },                             // required metadata block
  "entries": [ ... ]                           // required array
}
\`\`\`

### \`pack\` metadata block

| Key | Type | Required | Default |
| --- | --- | --- | --- |
| \`name\` | string, non-empty | yes | — (import fails without it) |
| \`description\` | string \\| null | no | \`null\` |
| \`source_label\` | string | no | \`"User content"\` |
| \`source_edition\` | string \\| null | no | \`null\` |
| \`source_type\` | string | no | \`"user"\` |
| \`visibility\` | string | no | \`"private"\` |

Use the PDF's title as \`name\` and \`source_label\`, and its printed edition as
\`source_edition\`. Keep the description short and factual, in your own words.

### \`entries\` array

Entries use the same schema as the library format:

| Key | Type | Required | Default |
| --- | --- | --- | --- |
| \`kind\` | string | yes | — |
| \`name\` | string | yes | — |
| \`category\` | string \\| null | no | \`null\` |
| \`summary\` | string \\| null | no | \`null\` |
| \`base_points\` | number | no | \`0\` |
| \`cost_per_level\` | number | no | \`0\` |
| \`max_levels\` | number \\| null | no | \`null\` |
| \`data\` | object | no | \`{}\` |
| \`tags\` | string[] | no | \`[]\` |
| \`pack\` | string | yes in practice | must equal \`pack.name\` |
| \`source_label\` | string | no | \`"User created"\` |
| \`source_edition\` | string \\| null | no | \`null\` |
| \`source_page\` | string \\| null | no | \`null\` |
| \`source_type\` | string | no | \`"user"\` |
| \`visibility\` | string | no | \`"private"\` |

Accepted \`kind\` values: ${ENTRY_KINDS.map((k) => `\`${k}\``).join(", ")}.

Every entry must name the same pack as the metadata block. The importer normalises entries to
\`pack.name\` anyway, so a mismatch means your mapping is wrong, not that it is harmless.

${DATA_FIELDS}

${WORKFLOW}

## Valid example pack

${json(packExample)}

${checklist("universal-character-forge-pack", [
  "`pack.name` is present and non-empty;",
  "every entry's `pack` equals `pack.name`;",
  "every entry has a non-empty `name` and `kind`;",
  "page numbers come from the PDF, entry by entry.",
])}

Return the JSON file and nothing else.
`;
}

export interface AiImportGuide {
  kind: GuideKind;
  filename: string;
  title: string;
  markdown: string;
}

export const AI_IMPORT_GUIDES: Record<GuideKind, AiImportGuide> = {
  character: {
    kind: "character",
    filename: "Universal_Character_Forge_CHARACTER_PDF_TO_IMPORT_GUIDE.md",
    title: "Character importer",
    markdown: characterGuide(),
  },
  library: {
    kind: "library",
    filename: "Universal_Character_Forge_LIBRARY_PDF_TO_IMPORT_GUIDE.md",
    title: "Library importer",
    markdown: libraryGuide(),
  },
  pack: {
    kind: "pack",
    filename: "Universal_Character_Forge_PACK_PDF_TO_IMPORT_GUIDE.md",
    title: "Pack importer",
    markdown: packGuide(),
  },
};

/** Extracts the fenced ```json blocks of a guide, for validation in tests. */
export function jsonBlocksOf(markdown: string): string[] {
  const out: string[] = [];
  const re = /```json\n([\s\S]*?)\n```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) out.push(m[1]!);
  return out;
}
