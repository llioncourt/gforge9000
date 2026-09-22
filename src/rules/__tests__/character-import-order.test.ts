import { describe, expect, it } from "vitest";
import { runCharacterImport, type CharacterImportDeps } from "@/lib/character-import";
import type { ImportedEntry } from "@/lib/trait-match";
import type { PortableCharacter } from "@/lib/portable";

function deps(captured: { entries?: ImportedEntry[] }): CharacterImportDeps {
  return {
    findByImportKey: async () => null,
    createCharacter: async () => ({ id: "c1", name: "Brann" }),
    updateCharacter: async () => ({ id: "c1", name: "Brann" }),
    deleteCharacter: async () => {},
    deleteEntriesOf: async () => {},
    addEntries: async (_id, entries) => {
      captured.entries = entries;
    },
    // Reconciliation keeps the file order but drops any position the file had.
    reconcile: async (entries) => ({
      entries: entries.map(({ sort_order: _drop, ...rest }) => rest as ImportedEntry),
    }),
  };
}

const file = {
  character: { id: "ignored", name: "Brann" },
  entries: [
    { kind: "trait", name: "Dark Vision" },
    { kind: "skill", name: "Stealth" },
    { kind: "skill", name: "Brawling" },
  ],
} as unknown as PortableCharacter;

describe("character import ordering", () => {
  it("numbers the imported entries in file order starting at zero", async () => {
    const captured: { entries?: ImportedEntry[] } = {};
    await runCharacterImport(file, deps(captured));
    expect(captured.entries?.map((e) => [e.name, e["sort_order"]])).toEqual([
      ["Dark Vision", 0],
      ["Stealth", 1],
      ["Brawling", 2],
    ]);
  });

  it("overrides any position the file carried so the order is contiguous", async () => {
    const captured: { entries?: ImportedEntry[] } = {};
    const messy = {
      ...file,
      entries: [
        { kind: "trait", name: "A", sort_order: 900 },
        { kind: "trait", name: "B", sort_order: 900 },
      ],
    } as unknown as PortableCharacter;
    await runCharacterImport(messy, deps(captured));
    expect(captured.entries?.map((e) => e["sort_order"])).toEqual([0, 1]);
  });
});

describe("character import honours a supplied order", () => {
  it("uses the positions the file declares when it declares them all", async () => {
    const captured: { entries?: ImportedEntry[] } = {};
    const out = {
      ...file,
      entries: [
        { kind: "skill", name: "Third", sort_order: 5 },
        { kind: "skill", name: "First", sort_order: 1 },
        { kind: "skill", name: "Second", sort_order: 2 },
      ],
    } as unknown as PortableCharacter;
    await runCharacterImport(out, deps(captured));
    expect(captured.entries?.map((e) => [e.name, e["sort_order"]])).toEqual([
      ["First", 0],
      ["Second", 1],
      ["Third", 2],
    ]);
  });
});
