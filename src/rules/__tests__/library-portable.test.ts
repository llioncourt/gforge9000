import { describe, expect, it } from "vitest";
import {
  libraryEntryToCharacterDraft,
  libraryToCsv,
  parsePortableLibrary,
  toPortableLibrary,
} from "@/lib/portable";

const row = {
  id: "abc",
  owner_id: "user-1",
  kind: "advantage",
  name: "Field Medic",
  category: "Talent",
  summary: "Original summary.",
  base_points: 10,
  cost_per_level: 10,
  max_levels: 4,
  data: { note: "x" },
  tags: ["medical"],
  pack: "Core Generic Pack",
  source_label: "Core Generic Pack",
  source_edition: "1",
  source_page: "12",
  source_type: "user",
  visibility: "private",
};

describe("library export", () => {
  it("strips ids and owners so exports are portable", () => {
    const out = toPortableLibrary([row]);
    expect(out.format).toBe("universal-character-forge-library");
    const entry = out.entries[0]! as unknown as Record<string, unknown>;
    expect(entry["id"]).toBeUndefined();
    expect(entry["owner_id"]).toBeUndefined();
    expect(entry["name"]).toBe("Field Medic");
    expect(entry["pack"]).toBe("Core Generic Pack");
  });

  it("round-trips through parse", () => {
    const json = JSON.stringify(toPortableLibrary([row]));
    const parsed = parsePortableLibrary(json);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]!.name).toBe("Field Medic");
    expect(parsed.entries[0]!.base_points).toBe(10);
  });

  it("rejects foreign files", () => {
    expect(() => parsePortableLibrary(JSON.stringify({ format: "other" }))).toThrow();
  });

  it("rejects entries without a name or kind", () => {
    const bad = JSON.stringify({
      format: "universal-character-forge-library",
      version: 1,
      entries: [{ kind: "advantage", name: "" }],
    });
    expect(() => parsePortableLibrary(bad)).toThrow(/name/i);
  });

  it("discards unknown fields rather than persisting them", () => {
    const json = JSON.stringify({
      format: "universal-character-forge-library",
      version: 1,
      entries: [{ ...row, evil: "rm -rf", owner_id: "someone-else" }],
    });
    const parsed = parsePortableLibrary(json);
    const entry = parsed.entries[0]! as unknown as Record<string, unknown>;
    expect(entry["evil"]).toBeUndefined();
    expect(entry["owner_id"]).toBeUndefined();
  });

  it("exports csv with a header row", () => {
    const csv = libraryToCsv(toPortableLibrary([row]).entries);
    expect(csv.split("\n")[0]).toContain("name");
    expect(csv).toContain("Field Medic");
  });
});

describe("library entry to character draft", () => {
  it("carries points and provenance", () => {
    const draft = libraryEntryToCharacterDraft(row);
    expect(draft.points).toBe(10);
    expect(draft.source["pack"]).toBe("Core Generic Pack");
    expect(draft.source["page"]).toBe("12");
  });

  it("equipment costs no character points", () => {
    const draft = libraryEntryToCharacterDraft({ ...row, kind: "equipment", base_points: 25 });
    expect(draft.points).toBe(0);
    expect(draft.data["quantity"]).toBe(1);
    expect(draft.data["carried"]).toBe(true);
  });

  it("gives skills defaults the builder can edit", () => {
    const draft = libraryEntryToCharacterDraft({ ...row, kind: "skill", data: {} });
    expect(draft.data["attribute"]).toBe("DX");
    expect(draft.data["difficulty"]).toBe("A");
    expect(draft.data["points"]).toBe(1);
  });
});
