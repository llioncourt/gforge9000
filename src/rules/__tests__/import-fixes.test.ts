import { describe, expect, it } from "vitest";

import { parsePortable, toPortable } from "@/lib/portable";
import { applyCatalogue, type CatalogueEntry, type ImportedEntry } from "@/lib/trait-match";
import type { CharacterEntry, CharacterRecord } from "@/rules";

const character = {
  id: "c1",
  name: "Test Subject",
  point_budget: 150,
  tech_level: 3,
  st: 10,
  dx: 11,
  iq: 12,
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
} as unknown as CharacterRecord;

describe("portable character validation", () => {
  it("accepts a file produced by the exporter", () => {
    const file = toPortable(character, [] as CharacterEntry[]);
    const parsed = parsePortable(JSON.stringify(file));
    expect(parsed.character.name).toBe("Test Subject");
  });

  it("rejects a file that is not JSON", () => {
    expect(() => parsePortable("not json at all")).toThrow(/valid JSON/i);
  });

  it("rejects a foreign format marker", () => {
    expect(() => parsePortable(JSON.stringify({ format: "other", version: 1 }))).toThrow();
  });

  it("rejects a future version instead of importing it blindly", () => {
    const file = { ...toPortable(character, [] as CharacterEntry[]), version: 99 };
    expect(() => parsePortable(JSON.stringify(file))).toThrow(/version/i);
  });

  it("rejects a character without a name", () => {
    const file = toPortable({ ...character, name: "" } as CharacterRecord, [] as CharacterEntry[]);
    expect(() => parsePortable(JSON.stringify(file))).toThrow(/name/i);
  });

  it("rejects an entry missing its kind", () => {
    const file = toPortable(character, [] as CharacterEntry[]);
    (file.entries as unknown[]).push({ name: "Brawling", points: 2 });
    expect(() => parsePortable(JSON.stringify(file))).toThrow(/kind/i);
  });
});

describe("applyCatalogue keeps specialisations", () => {
  const target: CatalogueEntry = {
    id: "lib1",
    kind: "skill",
    name: "Guns",
    category: "Combat",
    base_points: 1,
    cost_per_level: 0,
    data: {},
    source_label: "Library",
    source_edition: "",
    source_page: "",
    source_type: "user",
    pack: null,
  } as unknown as CatalogueEntry;

  it("re-appends the imported qualifier when the library entry has none", () => {
    const entry = { kind: "skill", name: "Guns (Pistol)", points: 2, levels: 1, data: {} } as ImportedEntry;
    const applied = applyCatalogue(entry, target);
    expect(applied.name).toBe("Guns (Pistol)");
    expect(applied.source?.imported_as).toBeUndefined();
  });

  it("keeps the library name when the import carried no qualifier", () => {
    const entry = { kind: "skill", name: "guns", points: 2, levels: 1, data: {} } as ImportedEntry;
    expect(applyCatalogue(entry, target).name).toBe("Guns");
  });

  it("does not double a qualifier the library entry already carries", () => {
    const qualified = { ...target, name: "Guns (Rifle)" } as CatalogueEntry;
    const entry = { kind: "skill", name: "Guns (Rifle)", points: 2, levels: 1, data: {} } as ImportedEntry;
    expect(applyCatalogue(entry, qualified).name).toBe("Guns (Rifle)");
  });
});
