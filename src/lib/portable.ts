import type { CharacterEntry, CharacterRecord, CharacterSheet } from "@/rules";

/**
 * Canonical portable format (UCF-JSON v1). Adapters for other tools should
 * convert *into* this shape; nothing here claims compatibility with any
 * third-party file format until such an adapter actually ships.
 */
export interface PortableCharacter {
  format: "universal-character-forge";
  version: 1;
  exported_at: string;
  character: CharacterRecord;
  entries: Omit<CharacterEntry, "id" | "character_id">[];
}

export function toPortable(
  character: CharacterRecord,
  entries: CharacterEntry[],
): PortableCharacter {
  return {
    format: "universal-character-forge",
    version: 1,
    exported_at: new Date().toISOString(),
    character,
    entries: entries.map(({ id: _id, character_id: _c, ...rest }) => rest),
  };
}

export function parsePortable(raw: string): PortableCharacter {
  const parsed = JSON.parse(raw) as PortableCharacter;
  if (parsed.format !== "universal-character-forge") {
    throw new Error("Unrecognised file. Expected a Universal Character Forge export.");
  }
  return parsed;
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
  const header = ["kind", "name", "category", "points", "levels", "level", "weight", "cost", "notes"];
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
  const entries = parsed.entries.map((entry, index) => {
    if (!entry || typeof entry !== "object") throw new Error(`Entry ${index + 1} is not an object.`);
    if (typeof entry.name !== "string" || entry.name.trim() === "") {
      throw new Error(`Entry ${index + 1} is missing a name.`);
    }
    if (typeof entry.kind !== "string" || entry.kind.trim() === "") {
      throw new Error(`Entry "${entry.name}" is missing a kind.`);
    }
    return toPortableLibrary([entry as unknown as Record<string, unknown>]).entries[0]!;
  });
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
export function libraryEntryToCharacterDraft(entry: {
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
}): {
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
    data["points"] = Number(data["points"] ?? 1);
  }
  if (entry.kind === "equipment") {
    data["quantity"] = Number(data["quantity"] ?? 1);
    data["carried"] = data["carried"] ?? true;
  }
  return {
    kind: entry.kind,
    name: entry.name,
    category: entry.category,
    points: entry.kind === "equipment" ? 0 : Number(entry.base_points ?? 0),
    levels: 1,
    notes: entry.summary,
    data,
    source: {
      label: entry.source_label,
      edition: entry.source_edition ?? "",
      page: entry.source_page ?? "",
      type: entry.source_type,
      pack: entry.pack ?? null,
    },
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
    if (!entry || typeof entry !== "object") throw new Error(`Entry ${index + 1} is not an object.`);
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
