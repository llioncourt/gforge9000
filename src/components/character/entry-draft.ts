/**
 * The editable form of a character entry, and the conversions to and from the
 * stored entry. The dialog that edits it lives in `entry-dialog.tsx`.
 */
import { isSkillLikeKind, syncInvestedPoints } from "@/rules";
import type { CharacterEntry, EntryKind } from "@/rules";

export interface EntryDraft {
  id?: string;
  kind: EntryKind;
  name: string;
  category: string;
  points: number;
  levels: number;
  notes: string;
  data: Record<string, unknown>;
  /**
   * Origin of the entry. Unknown keys written by other parts of the app (such
   * as a content-pack link) are carried through untouched by the editor.
   */
  source: { label: string; edition: string; page: string; type: string } & Record<string, unknown>;
}

export function emptyDraft(kind: EntryKind): EntryDraft {
  const base: EntryDraft = {
    kind,
    name: "",
    category: "",
    points: 0,
    levels: 1,
    notes: "",
    data: {},
    source: { label: "User created", edition: "", page: "", type: "user" },
  };
  if (isSkillLikeKind(kind)) {
    // Invested points live in BOTH places and must start out equal.
    base.points = 1;
    base.data = {
      attribute: "DX",
      difficulty: "A",
      points: 1,
      bonus: 0,
      specialization: "",
      defaults: "",
      prerequisites: "",
    };
  }
  if (kind === "equipment") {
    base.data = {
      quantity: 1,
      weight: 0,
      cost: 0,
      carried: true,
      tl: 8,
      legality: "",
      dr: 0,
      locations: [],
      weapons: [],
    };
  }
  return base;
}

export function toDraft(entry: CharacterEntry): EntryDraft {
  const s = (entry.source ?? {}) as Record<string, string | undefined>;
  return {
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    category: entry.category ?? "",
    ...(isSkillLikeKind(entry.kind)
      ? syncInvestedPoints(entry)
      : { points: entry.points, data: { ...(entry.data as Record<string, unknown>) } }),
    levels: entry.levels,
    notes: entry.notes ?? "",
    source: {
      ...((entry.source ?? {}) as Record<string, unknown>),
      label: s["label"] ?? "User created",
      edition: s["edition"] ?? "",
      page: s["page"] ?? "",
      type: s["type"] ?? "user",
    },
  };
}
