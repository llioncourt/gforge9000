/**
 * Pure helpers for the AI lore draft assistant.
 * The AI never writes to the database directly: it returns a draft that the GM
 * reviews and saves. Everything here is deterministic and unit tested; the
 * model call itself lives in `ai-lore.server.ts`.
 */
import { kindDef, type FieldDef } from "@/lib/entity-kinds";

export interface DraftField {
  key: string;
  value: string;
}

export interface LoreDraft {
  name: string;
  summary: string;
  fields: DraftField[];
}

export interface AppliedDraft {
  name: string;
  summary: string;
  data: Record<string, string | string[]>;
}

/** Field catalogue handed to the model so it only fills known keys. */
export function draftFieldCatalogue(kind: string): FieldDef[] {
  return kindDef(kind).fields.filter((f) => f.type !== "select");
}

export function buildLorePrompt(kind: string, brief: string, context?: string): string {
  const def = kindDef(kind);
  const fields = draftFieldCatalogue(kind)
    .map((f) => `- ${f.key} (${f.label}, ${f.type === "list" ? "list of short items" : "prose"})`)
    .join("\n");
  const lines = [
    `Draft one ${def.label} for a tabletop roleplaying campaign.`,
    `Brief from the game master: ${brief.trim()}`,
  ];
  if (context?.trim()) {
    lines.push(`Existing campaign material for consistency:\n${context.trim()}`);
  }
  lines.push(
    "Return a short evocative name, a summary of at most 400 characters, and values for the fields below.",
    "Only use these field keys; omit any field you have nothing useful to say about.",
    "For list fields, separate items with a newline. Keep every value under 600 characters.",
    "Write system-neutral fiction only: no game statistics, no rules text, no quotes from published books.",
    fields,
  );
  return lines.join("\n\n");
}

/** Maps a model draft onto the kind's schema, dropping unknown keys. */
export function applyDraft(kind: string, draft: LoreDraft): AppliedDraft {
  const defs = new Map(kindDef(kind).fields.map((f) => [f.key, f]));
  const data: Record<string, string | string[]> = {};
  for (const field of draft.fields ?? []) {
    const def = defs.get(field.key);
    const value = (field.value ?? "").trim();
    if (!def || !value) continue;
    if (def.type === "list") {
      const items = value
        .split(/\r?\n|;/)
        .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
        .filter(Boolean);
      if (items.length) data[field.key] = items;
    } else {
      data[field.key] = value;
    }
  }
  return {
    name: (draft.name ?? "").trim() || "Untitled",
    summary: (draft.summary ?? "").trim().slice(0, 400),
    data,
  };
}

/** Compact campaign context (names + summaries) so drafts stay consistent. */
export function buildContext(
  rows: { kind: string; name: string; summary: string | null }[],
  limit = 40,
): string {
  return rows
    .slice(0, limit)
    .map((row) => `${row.kind}: ${row.name}${row.summary ? ` — ${row.summary}` : ""}`)
    .join("\n");
}
