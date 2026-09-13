import { describe, expect, it } from "vitest";
import {
  entityInserts,
  entityKey,
  parsePortableLore,
  relationshipInserts,
  toPortableLore,
  type PortableLore,
} from "@/lib/lore-portable";
import type { EntityRow, RelationshipRow } from "@/lib/lore";

function entity(partial: Partial<EntityRow> & { id: string; name: string }): EntityRow {
  return {
    aliases: [],
    archived_at: null,
    campaign_id: "camp",
    canon_locked: false,
    character_id: null,
    created_at: "2026-01-01T00:00:00Z",
    created_by: "user",
    data: {},
    description: null,
    gm_notes: null,
    image_url: null,
    kind: "NPC",
    owner_user_id: null,
    parent_id: null,
    player_description: null,
    sort_order: 0,
    status: "Draft",
    summary: null,
    tags: [],
    updated_at: "2026-01-01T00:00:00Z",
    visibility: "gm",
    ...partial,
  } as EntityRow;
}

function relationship(source: string, target: string): RelationshipRow {
  return {
    campaign_id: "camp",
    created_at: "2026-01-01T00:00:00Z",
    created_by: "user",
    description: null,
    end_label: null,
    gm_description: null,
    id: "rel-1",
    is_current: true,
    rel_type: "ally",
    source_id: source,
    start_label: null,
    strength: null,
    target_id: target,
    updated_at: "2026-01-01T00:00:00Z",
    visibility: "gm",
  } as RelationshipRow;
}

describe("lore portable format", () => {
  const parent = entity({ id: "11111111-aaaa", name: "House Varn", kind: "FACTION" });
  const child = entity({ id: "22222222-bbbb", name: "Ser Alia", parent_id: parent.id });

  it("builds readable, unique keys", () => {
    expect(entityKey(parent)).toBe("faction:house-varn:11111111");
    expect(entityKey(child)).toBe("npc:ser-alia:22222222");
  });

  it("exports nesting and links by key", () => {
    const file = toPortableLore("Camp", [parent, child], [relationship(child.id, parent.id)]);
    expect(file.entities).toHaveLength(2);
    expect(file.entities[1]!.parent_key).toBe(entityKey(parent));
    expect(file.relationships[0]).toMatchObject({
      source_key: entityKey(child),
      target_key: entityKey(parent),
    });
  });

  it("drops relationships whose endpoints are missing", () => {
    const file = toPortableLore("Camp", [child], [relationship(child.id, "ghost")]);
    expect(file.relationships).toHaveLength(0);
  });

  it("round-trips through parse and rebuilds inserts", () => {
    const raw = JSON.stringify(toPortableLore("Camp", [parent, child], [relationship(child.id, parent.id)]));
    const parsed = parsePortableLore(raw);
    const planned = entityInserts(parsed, "new-camp");
    expect(planned.map((p) => p.row.name)).toEqual(["House Varn", "Ser Alia"]);
    expect(planned[0]!.row.campaign_id).toBe("new-camp");

    const ids = new Map(planned.map((p, index) => [p.key, `new-${index}`]));
    const rels = relationshipInserts(parsed, "new-camp", ids);
    expect(rels).toHaveLength(1);
    expect(rels[0]!.source_id).toBe("new-1");
    expect(rels[0]!.target_id).toBe("new-0");
  });

  it("rejects foreign files", () => {
    expect(() => parsePortableLore('{"format":"something-else"}')).toThrow(/Unrecognised/);
    const wrongVersion = JSON.stringify({ format: "ucf-campaign-lore", version: 9 } as unknown as PortableLore);
    expect(() => parsePortableLore(wrongVersion)).toThrow(/version/);
  });
});
