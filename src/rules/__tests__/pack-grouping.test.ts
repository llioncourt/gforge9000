import { describe, expect, it } from "vitest";
import {
  DEFAULT_PACK_NAME,
  campaignsEnablingPack,
  groupEntriesByKind,
  groupEntriesByPack,
  togglePackInList,
} from "@/lib/packs";
import { packFromSlug, packSlug } from "@/lib/pack-slug";
import { parsePortablePack, toPortablePack } from "@/lib/portable";

const entries = [
  { id: "1", name: "Fast Runner", kind: "advantage", pack: "Alpha" },
  { id: "2", name: "Clumsy", kind: "disadvantage", pack: "Alpha" },
  { id: "3", name: "Brawling", kind: "skill", pack: "Beta" },
  { id: "4", name: "House knack", kind: "perk", pack: null },
  { id: "5", name: "Scratch note", kind: "perk", pack: "   " },
];

describe("pack grouping", () => {
  it("groups entries by pack and puts orphans in the default pack", () => {
    const groups = groupEntriesByPack(entries);
    const names = groups.map((g) => g.label);
    expect(names).toContain("Alpha");
    expect(names).toContain("Beta");
    expect(names).toContain(DEFAULT_PACK_NAME);
    const personal = groups.find((g) => g.label === DEFAULT_PACK_NAME)!;
    expect(personal.entries).toHaveLength(2);
    expect(groups.find((g) => g.label === "Alpha")!.entries).toHaveLength(2);
  });

  it("breaks a pack down by kind", () => {
    const byKind = groupEntriesByKind(entries.filter((e) => e.pack === "Alpha"));
    expect(byKind.map((k) => k.kind).sort()).toEqual(["advantage", "disadvantage"]);
  });

  it("lists the campaigns that enable a pack", () => {
    const campaigns = [
      { id: "c1", name: "One", settings: { allowed_packs: ["Alpha"] } },
      { id: "c2", name: "Two", settings: { allowed_packs: [] } },
      { id: "c3", name: "Three", settings: { allowed_packs: ["beta"] } },
    ];
    expect(campaignsEnablingPack("Alpha", campaigns).map((c) => c.id)).toEqual(["c1"]);
    expect(campaignsEnablingPack("Beta", campaigns).map((c) => c.id)).toEqual(["c3"]);
  });

  it("toggles a pack in a campaign allow list without mutating it", () => {
    const list = ["Alpha"];
    const added = togglePackInList(list, "Beta", true);
    expect(added).toEqual(["Alpha", "Beta"]);
    expect(list).toEqual(["Alpha"]);
    expect(togglePackInList(added, "alpha", false)).toEqual(["Beta"]);
    expect(togglePackInList(added, "Beta", true)).toEqual(["Alpha", "Beta"]);
  });

  it("round-trips pack names through URL slugs", () => {
    for (const name of ["Alpha", "Tsubasa — Futebol cinematográfico", "a/b c"]) {
      expect(packFromSlug(packSlug(name))).toBe(name);
    }
  });
});

describe("portable pack import validation", () => {
  const rows = [
    { name: "Fast Runner", kind: "advantage", base_points: 5, pack: "Alpha" },
    { name: "Brawling", kind: "skill", base_points: 1, pack: "Alpha" },
  ];

  it("round-trips a pack export", () => {
    const pack = toPortablePack({ name: "Alpha", source_label: "User Content" }, rows);
    const parsed = parsePortablePack(JSON.stringify(pack));
    expect(parsed.pack.name).toBe("Alpha");
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.entries[0]!.name).toBe("Fast Runner");
  });

  it("rejects malformed payloads", () => {
    expect(() => parsePortablePack("not json")).toThrow();
    expect(() => parsePortablePack(JSON.stringify({ format: "nope" }))).toThrow();
    expect(() =>
      parsePortablePack(JSON.stringify({ format: "universal-character-forge-pack", version: 1 })),
    ).toThrow();
  });
});
