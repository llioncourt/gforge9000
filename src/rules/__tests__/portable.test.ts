import { describe, expect, it } from "vitest";
import { buildSheet, type CharacterEntry, type CharacterRecord } from "@/rules";
import { entriesToCsv, parsePortable, slugify, toPortable } from "@/lib/portable";

const character: CharacterRecord = {
  id: "c1",
  name: "Wren Calloway",
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
  conditions: [],
  wealth: "Average",
  status: 0,
};

const entries: CharacterEntry[] = [
  {
    id: "e1",
    kind: "advantage",
    name: "Quick Reflexes",
    points: 5,
    levels: 1,
    data: {},
  },
  {
    id: "e2",
    kind: "skill",
    name: "Urban Navigation",
    points: 0,
    levels: 1,
    data: { attribute: "IQ", difficulty: "A", points: 4 },
  },
  {
    id: "e3",
    kind: "equipment",
    name: "Responder Vest",
    points: 0,
    levels: 1,
    data: { quantity: 1, weight: 8, cost: 300, carried: true, dr: 5, locations: ["Torso"] },
  },
];

describe("portable export", () => {
  it("round-trips through the canonical JSON format", () => {
    const portable = toPortable(character, entries);
    const parsed = parsePortable(JSON.stringify(portable));
    expect(parsed.format).toBe("universal-character-forge");
    expect(parsed.character.name).toBe("Wren Calloway");
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0]).not.toHaveProperty("id");
  });

  it("rejects foreign files", () => {
    expect(() => parsePortable(JSON.stringify({ format: "other" }))).toThrow();
  });

  it("exports one CSV line per entry plus a header", () => {
    const sheet = buildSheet(character, entries);
    const csv = entriesToCsv(entries, sheet);
    expect(csv.split("\n")).toHaveLength(4);
    expect(csv.startsWith("kind,name")).toBe(true);
  });

  it("slugifies names for filenames", () => {
    expect(slugify("Wren Calloway")).toBe("wren-calloway");
  });
});

describe("smoke: end-to-end sheet build", () => {
  it("produces coherent totals, encumbrance and DR", () => {
    const sheet = buildSheet(character, entries);
    expect(sheet.stats.hp).toBe(12);
    expect(sheet.points.total).toBe(sheet.points.attributes + 5 + 4);
    expect(sheet.points.remaining).toBe(150 - sheet.points.total);
    expect(sheet.encumbrance.carriedWeight).toBe(8);
    expect(sheet.dr["Torso"]).toBe(5);
    expect(sheet.skills[0]?.level.effective).toBe(13);
  });
});
