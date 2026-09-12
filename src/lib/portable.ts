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
