import { describe, expect, it } from "vitest";
import {
  AI_IMPORT_GUIDES,
  characterMinimalExample,
  characterRichExample,
  jsonBlocksOf,
  libraryExample,
  packExample,
} from "@/lib/ai-import-guides";
import { parsePortable, parsePortableLibrary, parsePortablePack } from "@/lib/portable";

describe("AI conversion guides", () => {
  it("exposes one guide per import surface with a real filename and body", () => {
    for (const guide of Object.values(AI_IMPORT_GUIDES)) {
      expect(guide.filename.endsWith(".md")).toBe(true);
      expect(guide.markdown.length).toBeGreaterThan(2000);
      expect(guide.markdown).toContain("Mandatory pre-delivery checklist");
      expect(guide.markdown).toContain("raw JSON");
    }
  });

  it("does not claim an open SRD exists", () => {
    for (const guide of Object.values(AI_IMPORT_GUIDES)) {
      expect(guide.markdown).not.toMatch(/open SRD for GURPS(?! )/);
      expect(guide.markdown).toContain("no open SRD");
    }
  });

  it("validates the character examples with the real parser", () => {
    for (const example of [characterMinimalExample, characterRichExample]) {
      const parsed = parsePortable(JSON.stringify(example));
      expect(parsed.format).toBe("universal-character-forge");
      expect(parsed.character.name.length).toBeGreaterThan(0);
      expect(parsed.character).not.toHaveProperty("id");
      expect(JSON.stringify(parsed)).not.toContain("portrait");
    }
  });

  it("validates the library example with the real parser", () => {
    const parsed = parsePortableLibrary(JSON.stringify(libraryExample));
    expect(parsed.entries).toHaveLength(3);
    expect(parsed.entries[0]?.pack).toBe("Harbour Campaign Pack");
    expect(parsed.entries[2]?.pack).toBeNull();
  });

  it("validates the pack example with the real parser", () => {
    const parsed = parsePortablePack(JSON.stringify(packExample));
    expect(parsed.pack.name).toBe("Harbour Campaign Pack");
    expect(parsed.entries.every((e) => e.pack === "Harbour Campaign Pack")).toBe(true);
  });

  it("every JSON block embedded in every guide parses with its own parser", () => {
    const parserFor = {
      character: parsePortable,
      library: parsePortableLibrary,
      pack: parsePortablePack,
    } as const;
    for (const guide of Object.values(AI_IMPORT_GUIDES)) {
      const blocks = jsonBlocksOf(guide.markdown);
      expect(blocks.length).toBeGreaterThan(0);
      for (const block of blocks) {
        expect(() => parserFor[guide.kind](block)).not.toThrow();
      }
    }
  });
});
