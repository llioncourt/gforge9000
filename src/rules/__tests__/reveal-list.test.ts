import { describe, expect, it } from "vitest";

import type { EntityRow, GrantRow } from "@/lib/lore";
import { buildRevealList, matchesRevealSearch } from "@/lib/reveal-list";

const entity = (id: string, patch: Partial<EntityRow> = {}): EntityRow =>
  ({
    id,
    name: `Record ${id}`,
    kind: "NPC",
    visibility: "GM_ONLY",
    archived_at: null,
    summary: null,
    player_description: null,
    aliases: [],
    ...patch,
  }) as EntityRow;

const grant = (entityId: string, userId: string, at: string, note: string | null = null) =>
  ({
    id: `${entityId}-${userId}-${at}`,
    entity_id: entityId,
    user_id: userId,
    created_at: at,
    note,
  }) as GrantRow;

describe("reveals gathered for a player's sheet", () => {
  it("lists what was revealed to this player, newest first", () => {
    const list = buildRevealList(
      [
        entity("a", { visibility: "SELECTED_PLAYERS" }),
        entity("b", { visibility: "SELECTED_PLAYERS" }),
      ],
      [grant("a", "p1", "2026-09-01T10:00:00Z"), grant("b", "p1", "2026-09-05T10:00:00Z")],
      "p1",
    );
    expect(list.forPlayer.map((item) => item.entity.id)).toEqual(["b", "a"]);
    expect(list.forPlayer[0]!.revealedAt).toBe("2026-09-05T10:00:00Z");
    expect(list.forEveryone).toEqual([]);
  });

  it("never lists another player's reveals", () => {
    const list = buildRevealList(
      [entity("a", { visibility: "SELECTED_PLAYERS" })],
      [grant("a", "someone-else", "2026-09-01T10:00:00Z")],
      "p1",
    );
    expect(list.forPlayer).toEqual([]);
    expect(list.forEveryone).toEqual([]);
  });

  it("adds records visible to every player, by name, without repeating a revealed one", () => {
    const list = buildRevealList(
      [
        entity("z", { name: "Zebra", visibility: "ALL_PLAYERS" }),
        entity("m", { name: "Mapa", visibility: "PUBLIC" }),
        entity("both", { name: "Ambos", visibility: "ALL_PLAYERS" }),
        entity("secret", { visibility: "GM_ONLY" }),
        entity("hidden", { visibility: "UNREVEALED" }),
      ],
      [grant("both", "p1", "2026-09-01T10:00:00Z")],
      "p1",
    );
    expect(list.forPlayer.map((item) => item.entity.id)).toEqual(["both"]);
    expect(list.forEveryone.map((item) => item.entity.name)).toEqual(["Mapa", "Zebra"]);
  });

  it("keeps one line per record, using the latest reveal and its note", () => {
    const list = buildRevealList(
      [entity("a", { visibility: "SELECTED_PLAYERS" })],
      [
        grant("a", "p1", "2026-09-01T10:00:00Z", "old"),
        grant("a", "p1", "2026-09-09T10:00:00Z", "  new  "),
      ],
      "p1",
    );
    expect(list.forPlayer).toHaveLength(1);
    expect(list.forPlayer[0]!.revealedAt).toBe("2026-09-09T10:00:00Z");
    expect(list.forPlayer[0]!.note).toBe("  new  ");
  });

  it("skips archived records and reveals of records the caller cannot read", () => {
    const list = buildRevealList(
      [entity("gone", { visibility: "ALL_PLAYERS", archived_at: "2026-09-02T00:00:00Z" })],
      [
        grant("gone", "p1", "2026-09-01T10:00:00Z"),
        grant("not-readable", "p1", "2026-09-01T10:00:00Z"),
      ],
      "p1",
    );
    expect(list.forPlayer).toEqual([]);
    expect(list.forEveryone).toEqual([]);
  });

  it("without a known player shows only what every player can see", () => {
    const list = buildRevealList(
      [entity("a", { visibility: "SELECTED_PLAYERS" }), entity("b", { visibility: "ALL_PLAYERS" })],
      [grant("a", "p1", "2026-09-01T10:00:00Z")],
      null,
    );
    expect(list.forPlayer).toEqual([]);
    expect(list.forEveryone.map((item) => item.entity.id)).toEqual(["b"]);
  });

  it("searches only texts a player can read", () => {
    const item = {
      entity: entity("a", {
        name: "Capitão Vane",
        summary: "Contrabandista",
        player_description: "Deve um favor ao grupo",
        aliases: ["O Corvo"],
        description: "segredo do mestre",
        gm_notes: "outro segredo",
      }),
      source: "player" as const,
      revealedAt: null,
      note: null,
    };
    expect(matchesRevealSearch(item, "  ")).toBe(true);
    expect(matchesRevealSearch(item, "vane")).toBe(true);
    expect(matchesRevealSearch(item, "CORVO")).toBe(true);
    expect(matchesRevealSearch(item, "favor")).toBe(true);
    expect(matchesRevealSearch(item, "segredo")).toBe(false);
  });
});
