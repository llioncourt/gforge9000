import { z } from "zod";
import { isSkillLikeKind } from "@/rules";
import type { CharacterEntry, CharacterRecord, CharacterSheet } from "@/rules";
import { withPackLink, type PackLink } from "@/lib/pack-link";

/**
 * Canonical portable format (UCF-JSON v1). Adapters for other tools should
 * convert *into* this shape; nothing here claims compatibility with any
 * third-party file format until such an adapter actually ships.
 */
export interface PortableCharacter {
  format: "universal-character-forge";
  version: 1;
  exported_at: string;
  /** Stable identity of the exported sheet, when the exporter knew one. */
  import_key?: string;
  character: CharacterRecord;
  entries: Omit<CharacterEntry, "id" | "character_id">[];
}

export const PORTABLE_CHARACTER_VERSION = 1;

const numberish = z.union([z.number(), z.string()]).transform((v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("Expected a number.");
  return n;
});

const characterSchema = z
  .object({
    id: z.string().optional(),
    name: z.string().min(1, "Character name is missing."),
    point_budget: numberish.default(0),
    tech_level: numberish.default(0),
    st: numberish.default(10),
    dx: numberish.default(10),
    iq: numberish.default(10),
    ht: numberish.default(10),
    hp_delta: numberish.default(0),
    will_delta: numberish.default(0),
    per_delta: numberish.default(0),
    fp_delta: numberish.default(0),
    speed_delta: numberish.default(0),
    move_delta: numberish.default(0),
    conditions: z.array(z.string()).default([]),
    wealth: z.string().default("Average"),
    status: numberish.default(0),
  })
  .passthrough();

const entrySchema = z
  .object({
    kind: z.string().min(1, "An entry is missing its kind."),
    name: z.string().min(1, "An entry is missing its name."),
    category: z.string().nullish(),
    points: numberish.default(0),
    levels: numberish.default(1),
    notes: z.string().nullish(),
    data: z.record(z.string(), z.unknown()).default({}),
  })
  .passthrough();

/**
 * Top level is strict: an unknown key there means the file is not what it
 * claims to be. `character` and `entries` stay permissive on purpose, so a
 * sheet exported by a newer build (extra columns, extra entry data) still
 * imports instead of being refused.
 */
export const portableCharacterSchema = z
  .object({
    format: z.literal("universal-character-forge"),
    version: z.literal(PORTABLE_CHARACTER_VERSION),
    exported_at: z.string().default(""),
    /** Stable identity of the exported sheet; used to make re-imports idempotent. */
    import_key: z.string().trim().max(200).optional(),
    character: characterSchema,
    entries: z.array(entrySchema).default([]),
  })
  .strict();

export function toPortable(
  character: CharacterRecord,
  entries: CharacterEntry[],
): PortableCharacter {
  return {
    format: "universal-character-forge",
    version: 1,
    exported_at: new Date().toISOString(),
    import_key: `ucf-character:${character.id}`,
    character,
    entries: entries.map(({ id: _id, character_id: _c, ...rest }) => rest),
  };
}

/**
 * Parses and validates a character file. Structure, format marker and version
 * are all checked before anything reaches the database; unknown top-level
 * fields are rejected rather than written blindly.
 */
export function parsePortable(raw: string): PortableCharacter {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const shape = json as { format?: unknown; version?: unknown };
  if (shape?.format !== "universal-character-forge") {
    throw new Error("Unrecognised file. Expected a Universal Character Forge export.");
  }
  if (shape.version !== PORTABLE_CHARACTER_VERSION) {
    throw new Error(
      `This file was made with a different version of the character format (version ${String(shape.version)}).`,
    );
  }
  const result = portableCharacterSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? ` (${first.path.join(".")})` : "";
    throw new Error(
      `This character file is not valid${where}: ${first?.message ?? "unknown problem"}`,
    );
  }
  return result.data as unknown as PortableCharacter;
}

export function download(filename: string, contents: string, mime = "application/json") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function entriesToCsv(entries: CharacterEntry[], sheet: CharacterSheet): string {
  const header = [
    "kind",
    "name",
    "category",
    "points",
    "levels",
    "level",
    "weight",
    "cost",
    "notes",
  ];
  const lines = [header.join(",")];
  for (const e of entries) {
    const level = sheet.skills.find((s) => s.entry.id === e.id)?.level.effective ?? "";
    lines.push(
      [
        e.kind,
        e.name,
        e.category ?? "",
        e.points,
        e.levels,
        level,
        (e.data["weight"] as number) ?? "",
        (e.data["cost"] as number) ?? "",
        e.notes ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/* ---------- library / content packs ---------- */

export interface PortableLibraryEntry {
  kind: string;
  name: string;
  category: string | null;
  summary: string | null;
  base_points: number;
  cost_per_level: number;
  max_levels: number | null;
  data: Record<string, unknown>;
  tags: string[];
  pack: string | null;
  source_label: string;
  source_edition: string | null;
  source_page: string | null;
  source_type: string;
  visibility: string;
}

export interface PortableLibrary {
  format: "universal-character-forge-library";
  version: 1;
  exported_at: string;
  entries: PortableLibraryEntry[];
}

const LIBRARY_KEYS: (keyof PortableLibraryEntry)[] = [
  "kind",
  "name",
  "category",
  "summary",
  "base_points",
  "cost_per_level",
  "max_levels",
  "data",
  "tags",
  "pack",
  "source_label",
  "source_edition",
  "source_page",
  "source_type",
  "visibility",
];

/** Strips ids/owners so an export can be re-imported into any account. */
export function toPortableLibrary(rows: Record<string, unknown>[]): PortableLibrary {
  return {
    format: "universal-character-forge-library",
    version: 1,
    exported_at: new Date().toISOString(),
    entries: rows.map((row) => {
      const out = {} as Record<string, unknown>;
      for (const key of LIBRARY_KEYS) out[key] = row[key] ?? null;
      out["tags"] = Array.isArray(row["tags"]) ? row["tags"] : [];
      out["data"] = typeof row["data"] === "object" && row["data"] !== null ? row["data"] : {};
      out["base_points"] = Number(row["base_points"] ?? 0);
      out["cost_per_level"] = Number(row["cost_per_level"] ?? 0);
      out["source_label"] = String(row["source_label"] ?? "User created");
      out["source_type"] = String(row["source_type"] ?? "user");
      out["visibility"] = String(row["visibility"] ?? "private");
      return out as unknown as PortableLibraryEntry;
    }),
  };
}

/**
 * Parses and validates a library export. Data-only: nothing here evaluates
 * imported content, and unknown fields are discarded rather than persisted.
 */
export function parsePortableLibrary(raw: string): PortableLibrary {
  const parsed = JSON.parse(raw) as Partial<PortableLibrary>;
  if (parsed?.format !== "universal-character-forge-library") {
    throw new Error("Unrecognised file. Expected a Universal Character Forge library export.");
  }
  if (!Array.isArray(parsed.entries)) throw new Error("Library export has no entries array.");
  // Every rejected row is collected with its position and (when readable) its
  // name, then reported together — never dropped silently. A single throw on
  // the first bad row would hide every other invalid row behind it and could
  // read as "the file only had N entries" instead of "M rows were rejected".
  const rejected: string[] = [];
  const entries: PortableLibraryEntry[] = [];
  parsed.entries.forEach((entry, index) => {
    const position = index + 1;
    if (!entry || typeof entry !== "object") {
      rejected.push(`row ${position}: not an object`);
      return;
    }
    const label =
      typeof (entry as Record<string, unknown>).name === "string" &&
      (entry as Record<string, unknown>).name !== ""
        ? `"${(entry as Record<string, unknown>).name as string}"`
        : `row ${position}`;
    if (typeof entry.name !== "string" || entry.name.trim() === "") {
      rejected.push(`row ${position}: missing a name`);
      return;
    }
    if (typeof entry.kind !== "string" || entry.kind.trim() === "") {
      rejected.push(`${label}: missing a kind`);
      return;
    }
    entries.push(toPortableLibrary([entry as unknown as Record<string, unknown>]).entries[0]!);
  });
  if (rejected.length > 0) {
    throw new Error(
      `Library export has ${rejected.length} invalid ${rejected.length === 1 ? "entry" : "entries"}: ` +
        rejected.join("; "),
    );
  }
  return { format: parsed.format, version: 1, exported_at: parsed.exported_at ?? "", entries };
}

export function libraryToCsv(rows: PortableLibraryEntry[]): string {
  const header = ["kind", "name", "category", "base_points", "pack", "tags", "source", "summary"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.kind,
        r.name,
        r.category ?? "",
        r.base_points,
        r.pack ?? "",
        (r.tags ?? []).join(" "),
        [r.source_label, r.source_edition, r.source_page].filter(Boolean).join(" "),
        r.summary ?? "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}

/**
 * Pure mapping from a library entry to a character entry payload so the
 * builder can add saved content without retyping it.
 */
export function libraryEntryToCharacterDraft(
  entry: {
    kind: string;
    name: string;
    category: string | null;
    base_points: number;
    summary: string | null;
    data: Record<string, unknown> | null;
    pack?: string | null;
    source_label: string;
    source_edition: string | null;
    source_page: string | null;
    source_type: string;
  },
  /**
   * The pack-link record, when the caller explicitly picked this entry from a
   * content pack (see `buildLink`/`withPackLink` in `pack-link-service.ts`).
   * `null`/omitted keeps the entry a plain custom addition — free-text or
   * hand-typed content is never auto-linked.
   */
  link?: PackLink | null,
): {
  kind: string;
  name: string;
  category: string | null;
  points: number;
  levels: number;
  notes: string | null;
  data: Record<string, unknown>;
  source: Record<string, unknown>;
} {
  const data = { ...(entry.data ?? {}) };
  if (entry.kind === "skill" || entry.kind === "technique" || entry.kind === "spell") {
    data["attribute"] = data["attribute"] ?? "DX";
    data["difficulty"] = data["difficulty"] ?? "A";
    // Both representations start out equal — never create a divergent draft.
    data["points"] = Number(data["points"] ?? 1);
  }
  if (entry.kind === "equipment") {
    data["quantity"] = Number(data["quantity"] ?? 1);
    data["carried"] = data["carried"] ?? true;
  }
  // A leveled trait added from a pack stores its cost as the TOTAL, so the
  // rules engine never multiplies it by levels again (src/rules/trait-cost.ts).
  if (link && usesLeveledPoints(entry.kind)) {
    data[TRAIT_POINTS_SEMANTICS_KEY] = "total";
  }
  const baseSource: Record<string, unknown> = {
    label: entry.source_label,
    edition: entry.source_edition ?? "",
    page: entry.source_page ?? "",
    type: entry.source_type,
    pack: entry.pack ?? null,
  };
  return {
    kind: entry.kind,
    name: entry.name,
    category: entry.category,
    points: isSkillLikeKind(entry.kind)
      ? Number(data["points"] ?? 1)
      : entry.kind === "equipment"
        ? 0
        : Number(entry.base_points ?? 0),
    levels: 1,
    notes: entry.summary,
    data,
    source: link ? withPackLink(baseSource, link) : baseSource,
  };
}

/* ---------- content packs ---------- */

export interface PortablePackMeta {
  name: string;
  description: string | null;
  source_label: string;
  source_edition: string | null;
  source_type: string;
  visibility: string;
}

export interface PortablePack {
  format: "universal-character-forge-pack";
  version: 1;
  exported_at: string;
  pack: PortablePackMeta;
  entries: PortableLibraryEntry[];
}

export function toPortablePack(
  pack: Partial<PortablePackMeta> & { name: string },
  rows: Record<string, unknown>[],
): PortablePack {
  return {
    format: "universal-character-forge-pack",
    version: 1,
    exported_at: new Date().toISOString(),
    pack: {
      name: pack.name,
      description: pack.description ?? null,
      source_label: pack.source_label ?? "User content",
      source_edition: pack.source_edition ?? null,
      source_type: pack.source_type ?? "user",
      visibility: pack.visibility ?? "private",
    },
    entries: toPortableLibrary(rows).entries.map((e) => ({ ...e, pack: pack.name })),
  };
}

/**
 * Validates a pack file. A plain library export is also accepted as long as
 * every entry names the same pack, so existing exports keep working.
 */
export function parsePortablePack(raw: string): PortablePack {
  const parsed = JSON.parse(raw) as Partial<PortablePack> & Partial<PortableLibrary>;
  if (parsed?.format === "universal-character-forge-library") {
    const library = parsePortableLibrary(raw);
    const names = [...new Set(library.entries.map((e) => (e.pack ?? "").trim()).filter(Boolean))];
    if (names.length !== 1) {
      throw new Error(
        "This library export does not describe a single pack. Import it from the Library page instead.",
      );
    }
    return {
      format: "universal-character-forge-pack",
      version: 1,
      exported_at: library.exported_at,
      pack: {
        name: names[0]!,
        description: null,
        source_label: library.entries[0]?.source_label ?? "User content",
        source_edition: null,
        source_type: "user",
        visibility: "private",
      },
      entries: library.entries,
    };
  }
  if (parsed?.format !== "universal-character-forge-pack") {
    throw new Error("Unrecognised file. Expected a Universal Character Forge pack export.");
  }
  const meta = parsed.pack;
  if (!meta || typeof meta.name !== "string" || meta.name.trim() === "") {
    throw new Error("Pack export is missing a pack name.");
  }
  if (!Array.isArray(parsed.entries)) throw new Error("Pack export has no entries array.");
  const name = meta.name.trim();
  const entries = parsed.entries.map((entry, index) => {
    if (!entry || typeof entry !== "object")
      throw new Error(`Entry ${index + 1} is not an object.`);
    if (typeof entry.name !== "string" || entry.name.trim() === "") {
      throw new Error(`Entry ${index + 1} is missing a name.`);
    }
    if (typeof entry.kind !== "string" || entry.kind.trim() === "") {
      throw new Error(`Entry "${entry.name}" is missing a kind.`);
    }
    const normalised = toPortableLibrary([entry as unknown as Record<string, unknown>]).entries[0]!;
    return { ...normalised, pack: name };
  });
  return {
    format: "universal-character-forge-pack",
    version: 1,
    exported_at: parsed.exported_at ?? "",
    pack: {
      name,
      description: meta.description ?? null,
      source_label: meta.source_label ?? "User content",
      source_edition: meta.source_edition ?? null,
      source_type: meta.source_type ?? "user",
      visibility: meta.visibility ?? "private",
    },
    entries,
  };
}
