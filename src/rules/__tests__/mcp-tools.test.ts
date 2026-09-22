import { describe, expect, it } from "vitest";
import {
  MCP_GM_ONLY_FIELDS,
  MCP_MAX_LIMIT,
  MCP_TOOL_NAMES,
  __stripGmFields,
  buildMcpServer,
} from "@/lib/mcp/tools.server";

function fakeContext() {
  return {
    // Never used by the assertions below — building the server only registers tools.
    supabase: {} as never,
    userId: "00000000-0000-0000-0000-000000000001",
  };
}

describe("assistant tool surface", () => {
  it("registers exactly the documented tools", () => {
    const server = buildMcpServer(fakeContext());
    const registered = Object.keys(
      (server as unknown as { _registeredTools: Record<string, unknown> })._registeredTools,
    );
    expect(registered.sort()).toEqual([...MCP_TOOL_NAMES].sort());
    expect(registered).toHaveLength(23);
  });

  it("marks read tools read-only and delete tools destructive", () => {
    const server = buildMcpServer(fakeContext());
    const tools = (
      server as unknown as {
        _registeredTools: Record<string, { annotations?: Record<string, boolean> }>;
      }
    )._registeredTools;

    for (const name of ["list_campaigns", "list_entries", "get_entry", "get_character"]) {
      expect(tools[name]?.annotations?.["readOnlyHint"]).toBe(true);
    }
    for (const name of ["delete_entry", "delete_character_entry"]) {
      expect(tools[name]?.annotations?.["destructiveHint"]).toBe(true);
      expect(tools[name]?.annotations?.["readOnlyHint"]).toBe(false);
    }
  });

  it("validates tool input and rejects unbounded limits", () => {
    const server = buildMcpServer(fakeContext());
    const tools = (
      server as unknown as {
        _registeredTools: Record<
          string,
          { inputSchema?: { safeParse: (value: unknown) => { success: boolean } } }
        >;
      }
    )._registeredTools;

    const listEntries = tools["list_entries"]?.inputSchema;
    expect(listEntries).toBeDefined();
    expect(listEntries!.safeParse({ campaign_id: "not-a-uuid" }).success).toBe(false);
    expect(
      listEntries!.safeParse({
        campaign_id: "11111111-1111-4111-8111-111111111111",
        limit: MCP_MAX_LIMIT + 1,
      }).success,
    ).toBe(false);
    expect(
      listEntries!.safeParse({
        campaign_id: "11111111-1111-4111-8111-111111111111",
        limit: MCP_MAX_LIMIT,
      }).success,
    ).toBe(true);
  });
});

describe("game master fields", () => {
  const entity = { id: "e1", name: "Vault", gm_notes: "secret", summary: "public" };

  it("removes gm notes for players", () => {
    const out = __stripGmFields(entity, false, MCP_GM_ONLY_FIELDS.entity);
    expect(out).not.toHaveProperty("gm_notes");
    expect(out["summary"]).toBe("public");
  });

  it("keeps gm notes for the game master", () => {
    const out = __stripGmFields(entity, true, MCP_GM_ONLY_FIELDS.entity);
    expect(out["gm_notes"]).toBe("secret");
  });

  it("removes gm descriptions from relationships for players", () => {
    const out = __stripGmFields(
      { id: "r1", rel_type: "ally", gm_description: "secret" },
      false,
      MCP_GM_ONLY_FIELDS.relationship,
    );
    expect(out).not.toHaveProperty("gm_description");
  });

  it("does not mutate the source row", () => {
    __stripGmFields(entity, false, MCP_GM_ONLY_FIELDS.entity);
    expect(entity.gm_notes).toBe("secret");
  });
});

/* ------------------------------------------------------------------ */
/* get_entry / get_character full-content text replies                 */
/* ------------------------------------------------------------------ */

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
};

interface RegisteredTool {
  handler: (input: Record<string, unknown>) => Promise<ToolResult>;
  inputSchema?: { safeParse: (value: unknown) => { success: boolean } };
}

/** Chainable thenable standing in for a supabase-js query builder. */
function query(data: unknown, extra: Record<string, unknown> = {}, spy?: Spy) {
  const self: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "order",
    "limit",
    "ilike",
    "update",
    "delete",
    "single",
    "maybeSingle",
  ]) {
    self[method] = () => self;
  }
  self["update"] = (payload: unknown) => {
    if (spy) spy.updated = payload;
    return self;
  };
  self["insert"] = (payload: unknown) => {
    if (spy) spy.inserted = payload;
    return self;
  };
  self["then"] = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error: null, ...extra }).then(resolve);
  return self;
}

type Spy = { inserted?: unknown; updated?: unknown };

const USER = "00000000-0000-0000-0000-000000000001";
const GM = "00000000-0000-0000-0000-0000000000ff";
const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const ENTITY_ID = "22222222-2222-4222-8222-222222222222";
const CHARACTER_ID = "33333333-3333-4333-8333-333333333333";

type TableResult = unknown | { __result: unknown; extra?: Record<string, unknown> };

function serverWith(
  tables: Record<string, TableResult | TableResult[]>,
  userId: string,
  spy?: Spy,
) {
  const queues: Record<string, TableResult[]> = {};
  for (const [table, value] of Object.entries(tables)) {
    if (Array.isArray(value) && value.some((v) => v && typeof v === "object" && "__result" in v)) {
      queues[table] = value as TableResult[];
    }
  }
  const resolve = (table: string) => {
    const queued = queues[table];
    const raw = queued && queued.length > 0 ? queued.shift() : tables[table];
    if (raw && typeof raw === "object" && "__result" in raw) {
      const wrapped = raw as { __result: unknown; extra?: Record<string, unknown> };
      return query(wrapped.__result, wrapped.extra ?? {}, spy);
    }
    return query(raw, {}, spy);
  };
  const RPC_TABLES: Record<string, string> = {
    list_entities_safe: "entities",
    list_relationships_safe: "entity_relationships",
    mcp_create_campaign: "rpc_create_campaign",
    mcp_update_campaign: "rpc_update_campaign",
    mcp_delete_campaign: "rpc_delete_campaign",
  };
  const supabase = {
    rpc: (fn: string) => resolve(RPC_TABLES[fn] ?? "entities"),
    from: (table: string) => resolve(table),
  };
  const server = buildMcpServer({ supabase: supabase as never, userId });
  return (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools;
}

const campaignRow = { id: CAMPAIGN, name: "Nadrel", gm_id: GM };

const entityRow = {
  id: ENTITY_ID,
  campaign_id: CAMPAIGN,
  kind: "location",
  name: "Vault of Echoes",
  summary: "A sealed vault under the citadel.",
  description: "Long sealed. The door answers only to the dawn bell.",
  gm_notes: "The vault hides the traitor's ledger.",
  status: "active",
  visibility: "all_players",
};

describe("get_entry text content", () => {
  it("includes the full item JSON after the summary line", async () => {
    const tools = serverWith({ entities: entityRow, campaigns: campaignRow }, GM);
    const result = await tools["get_entry"]!.handler({ entry_id: ENTITY_ID });

    const text = result.content[0]!.text;
    expect(text).toContain('location "Vault of Echoes" in "Nadrel".');
    // Full fields from the item, not just the summary line.
    expect(text).toContain('"description": "Long sealed. The door answers only to the dawn bell."');
    expect(text).toContain('"summary": "A sealed vault under the citadel."');
    expect(text).toContain('"gm_notes": "The vault hides the traitor\'s ledger."');

    const item = result.structuredContent["item"] as Record<string, unknown>;
    expect(item["name"]).toBe("Vault of Echoes");
    expect(item["gm_notes"]).toBe("The vault hides the traitor's ledger.");
  });

  it("never leaks GM-only fields to a non-GM caller, in text or structured content", async () => {
    const tools = serverWith({ entities: entityRow, campaigns: campaignRow }, USER);
    const result = await tools["get_entry"]!.handler({ entry_id: ENTITY_ID });

    expect(result.content[0]!.text).not.toContain("gm_notes");
    expect(result.content[0]!.text).not.toContain("traitor");
    // Non-GM still receives the full public item in the text block.
    expect(result.content[0]!.text).toContain('"description":');

    const item = result.structuredContent["item"] as Record<string, unknown>;
    expect(item).not.toHaveProperty("gm_notes");
  });
});

describe("get_character text content", () => {
  const characterRow = {
    id: CHARACTER_ID,
    name: "Brann Ashfall",
    concept: "Disgraced bellkeeper",
    owner_id: USER,
    campaign_id: CAMPAIGN,
    is_npc: false,
    is_template: false,
    point_budget: 300,
    tech_level: 4,
    gm_notes: "Secretly bound to the dawn bell.",
  };
  const entries = [
    { id: "e1", kind: "trait", name: "Dark Vision", category: "advantage", points: 25 },
    { id: "e2", kind: "skill", name: "Stealth", category: "DX/Average", points: 4, levels: 1 },
  ];

  function characterTools(userId: string) {
    return serverWith(
      { characters: characterRow, campaigns: campaignRow, character_entries: entries },
      userId,
    );
  }

  it("includes the sheet fields and entries JSON after the summary line", async () => {
    const tools = characterTools(USER);
    const result = await tools["get_character"]!.handler({ character_id: CHARACTER_ID });

    const text = result.content[0]!.text;
    expect(text).toContain('Character "Brann Ashfall" — showing 2 of 2 entries.');
    expect(text).toContain('"point_budget": 300');
    expect(text).toContain('"concept": "Disgraced bellkeeper"');
    expect(text).toContain('"name": "Dark Vision"');
    expect(text).toContain('"name": "Stealth"');

    const item = result.structuredContent["item"] as Record<string, unknown>;
    expect(item["name"]).toBe("Brann Ashfall");
    expect(item["gm_notes"]).toBe("Secretly bound to the dawn bell.");
    expect(item["entries"]).toHaveLength(2);
  });

  it("never leaks sheet GM notes to someone who is neither owner nor GM", async () => {
    const tools = characterTools("99999999-9999-4999-8999-999999999999");
    const result = await tools["get_character"]!.handler({ character_id: CHARACTER_ID });

    expect(result.content[0]!.text).not.toContain("gm_notes");
    expect(result.content[0]!.text).not.toContain("dawn bell");
    const item = result.structuredContent["item"] as Record<string, unknown>;
    expect(item).not.toHaveProperty("gm_notes");
    // The sheet itself is still fully present in the text block.
    expect(result.content[0]!.text).toContain('"point_budget": 300');
  });
});

/* ------------------------------------------------------------------ */
/* entry count reporting and append ordering                           */
/* ------------------------------------------------------------------ */

const sheetRow = {
  id: CHARACTER_ID,
  name: "Brann Ashfall",
  owner_id: USER,
  campaign_id: CAMPAIGN,
  is_npc: false,
  is_template: false,
  point_budget: 300,
  tech_level: 4,
};

describe("get_character entry counts", () => {
  const rows = [
    { id: "e1", kind: "trait", name: "Dark Vision" },
    { id: "e2", kind: "skill", name: "Stealth" },
  ];

  it("reports the full total when nothing was truncated", async () => {
    const tools = serverWith(
      {
        characters: sheetRow,
        campaigns: campaignRow,
        character_entries: [{ __result: rows }, { __result: null, extra: { count: 2 } }],
      },
      USER,
    );
    const result = await tools["get_character"]!.handler({ character_id: CHARACTER_ID });
    expect(result.content[0]!.text).toContain(
      'Character "Brann Ashfall" — showing 2 of 2 entries.',
    );
  });

  it("reports returned of total with a hint when truncated", async () => {
    const tools = serverWith(
      {
        characters: sheetRow,
        campaigns: campaignRow,
        character_entries: [{ __result: rows }, { __result: null, extra: { count: 57 } }],
      },
      USER,
    );
    const result = await tools["get_character"]!.handler({
      character_id: CHARACTER_ID,
      entry_limit: 2,
    });
    expect(result.content[0]!.text).toContain(
      'Character "Brann Ashfall" — showing 2 of 57 entries (more may exist — raise entry_limit).',
    );
  });
});

describe("add_character_entry", () => {
  function addTools(lastSortOrder: unknown, spy: Spy) {
    return serverWith(
      {
        characters: sheetRow,
        campaigns: campaignRow,
        character_entries: [
          { __result: lastSortOrder },
          {
            __result: {
              id: "44444444-4444-4444-8444-444444444444",
              character_id: CHARACTER_ID,
              kind: "skill",
              name: "Stealth",
            },
          },
        ],
      },
      USER,
      spy,
    );
  }

  const input = { character_id: CHARACTER_ID, kind: "skill", name: "Stealth" };

  it("returns the created entry id in the text content", async () => {
    const spy: Spy = {};
    const result = await addTools(null, spy)["add_character_entry"]!.handler(input);
    expect(result.content[0]!.text).toContain(
      'Added "Stealth" to "Brann Ashfall" (entry_id: 44444444-4444-4444-8444-444444444444).',
    );
    expect(result.content[0]!.text).toContain('"id": "44444444-4444-4444-8444-444444444444"');
  });

  it("uses sort_order 0 when the character has no entries", async () => {
    const spy: Spy = {};
    await addTools(null, spy)["add_character_entry"]!.handler(input);
    expect((spy.inserted as Record<string, unknown>)["sort_order"]).toBe(0);
  });

  it("appends with max + 1 when entries already exist", async () => {
    const spy: Spy = {};
    await addTools({ sort_order: 7 }, spy)["add_character_entry"]!.handler(input);
    expect((spy.inserted as Record<string, unknown>)["sort_order"]).toBe(8);
  });
});

/* ------------------------------------------------------------------ */
/* campaign authoring expansion                                        */
/* ------------------------------------------------------------------ */

const OUTSIDER = "99999999-9999-4999-8999-999999999999";

async function expectFailure(run: Promise<unknown>, match: RegExp) {
  await expect(run).rejects.toThrow(match);
}

describe("update_campaign", () => {
  it("lets the Game Master rename a campaign and returns the full row", async () => {
    const spy: Spy = {};
    const tools = serverWith(
      {
        campaigns: campaignRow,
        rpc_update_campaign: { ...campaignRow, name: "Nadrel II" },
      },
      GM,
      spy,
    );
    const result = await tools["update_campaign"]!.handler({
      campaign_id: CAMPAIGN,
      name: "Nadrel II",
    });
    expect(result.content[0]!.text).toContain(`Updated campaign "Nadrel II" (${CAMPAIGN}).`);
    expect(result.content[0]!.text).toContain('"name": "Nadrel II"');
    expect((result.structuredContent["item"] as Record<string, unknown>)["id"]).toBe(CAMPAIGN);
  });

  it("refuses a player and an empty patch", async () => {
    await expectFailure(
      serverWith({ campaigns: campaignRow }, USER)["update_campaign"]!.handler({
        campaign_id: CAMPAIGN,
        name: "Nope",
      }),
      /Game Master/,
    );
    await expectFailure(
      serverWith({ campaigns: campaignRow }, GM)["update_campaign"]!.handler({
        campaign_id: CAMPAIGN,
      }),
      /Nothing to update/,
    );
  });
});

describe("update_character", () => {
  const updated = { ...sheetRow, concept: null, gm_notes: "hidden" };

  function tools(userId: string, spy?: Spy) {
    return serverWith(
      { characters: [{ __result: sheetRow }, { __result: updated }], campaigns: campaignRow },
      userId,
      spy,
    );
  }

  it("lets the owner clear a nullable field", async () => {
    const spy: Spy = {};
    const result = await tools(USER, spy)["update_character"]!.handler({
      character_id: CHARACTER_ID,
      concept: null,
    });
    expect(spy.updated).toEqual({ concept: null });
    expect(result.content[0]!.text).toContain(`Updated character "Brann Ashfall"`);
    expect(result.content[0]!.text).toContain('"concept": null');
  });

  it("lets the campaign Game Master edit and refuses an outsider", async () => {
    const gmResult = await tools(GM)["update_character"]!.handler({
      character_id: CHARACTER_ID,
      notes: "Bell duty",
    });
    expect(gmResult.structuredContent["item"]).toBeDefined();
    await expectFailure(
      tools(OUTSIDER)["update_character"]!.handler({ character_id: CHARACTER_ID, notes: "x" }),
      /owner|Game Master/,
    );
  });

  it("rejects an empty patch", async () => {
    await expectFailure(
      tools(USER)["update_character"]!.handler({ character_id: CHARACTER_ID }),
      /Nothing to update/,
    );
  });

  it("accepts quarter-step speed and rejects anything else", () => {
    const schema = serverWith({}, USER)["update_character"]!.inputSchema!;
    expect(schema.safeParse({ character_id: CHARACTER_ID, speed_delta: 0.25 }).success).toBe(true);
    expect(schema.safeParse({ character_id: CHARACTER_ID, speed_delta: -1.5 }).success).toBe(true);
    expect(schema.safeParse({ character_id: CHARACTER_ID, speed_delta: 0.3 }).success).toBe(false);
  });

  it("verifies the target campaign before moving a sheet", async () => {
    const spy: Spy = {};
    const result = await serverWith(
      {
        characters: [{ __result: sheetRow }, { __result: { ...sheetRow, campaign_id: CAMPAIGN } }],
        campaigns: campaignRow,
      },
      USER,
      spy,
    )["update_character"]!.handler({ character_id: CHARACTER_ID, campaign_id: CAMPAIGN });
    expect(spy.updated).toEqual({ campaign_id: CAMPAIGN });
    expect(result.content[0]!.text).toContain('"campaign_id"');
  });

  it("never returns gm_notes to a non-owner, non-GM caller", async () => {
    await expectFailure(
      tools(OUTSIDER)["update_character"]!.handler({ character_id: CHARACTER_ID, notes: "x" }),
      /change this sheet/,
    );
  });
});

describe("create_character", () => {
  it("writes only the fields given and returns the complete row with its id", async () => {
    const spy: Spy = {};
    const created = { ...sheetRow, st: 12, conditions: ["Shock"] };
    const tools = serverWith({ characters: created, campaigns: campaignRow }, USER, spy);
    const result = await tools["create_character"]!.handler({
      name: "Brann Ashfall",
      st: 12,
      conditions: ["Shock"],
      appearance: { hair: "ash" },
      campaign_id: CAMPAIGN,
    });
    const inserted = spy.inserted as Record<string, unknown>;
    expect(inserted["owner_id"]).toBe(USER);
    expect(inserted["st"]).toBe(12);
    expect(inserted).not.toHaveProperty("dx");
    expect(result.content[0]!.text).toContain(
      `Created character "Brann Ashfall" (${CHARACTER_ID}).`,
    );
    expect(result.content[0]!.text).toContain('"st": 12');
  });
});

describe("delete_character", () => {
  function tools(userId: string) {
    return serverWith(
      {
        characters: [{ __result: sheetRow }, { __result: [{ id: CHARACTER_ID }] }],
        campaigns: campaignRow,
      },
      userId,
    );
  }

  it("lets the owner delete and returns the delete payload", async () => {
    const result = await tools(USER)["delete_character"]!.handler({ character_id: CHARACTER_ID });
    expect(result.structuredContent).toEqual({ deleted: true, id: CHARACTER_ID });
    expect(result.content[0]!.text).toContain('"deleted": true');
  });

  it("refuses a Game Master who does not own the sheet", async () => {
    await expectFailure(
      tools(GM)["delete_character"]!.handler({ character_id: CHARACTER_ID }),
      /Only the owner/,
    );
  });
});

describe("update_character_entry", () => {
  const found = { id: "e1", name: "Stealth", character_id: CHARACTER_ID };
  const updatedEntry = { ...found, kind: "skill", category: null, points: 8, notes: null };

  function tools(userId: string, spy?: Spy) {
    return serverWith(
      {
        character_entries: [{ __result: found }, { __result: updatedEntry }],
        characters: sheetRow,
        campaigns: campaignRow,
      },
      userId,
      spy,
    );
  }

  it("applies a partial update with explicit nulls", async () => {
    const spy: Spy = {};
    const result = await tools(USER, spy)["update_character_entry"]!.handler({
      entry_id: "e1",
      points: 8,
      category: null,
    });
    expect(spy.updated).toEqual({ points: 8, category: null });
    expect(result.content[0]!.text).toContain('"points": 8');
    expect(result.content[0]!.text).toContain('"category": null');
  });

  it("refuses an outsider and an empty patch", async () => {
    await expectFailure(
      tools(OUTSIDER)["update_character_entry"]!.handler({ entry_id: "e1", points: 1 }),
      /change this sheet/,
    );
    await expectFailure(
      tools(USER)["update_character_entry"]!.handler({ entry_id: "e1" }),
      /Nothing to update/,
    );
  });
});

describe("add_character_entry sort order input", () => {
  it("uses an explicit sort_order without looking up the maximum", async () => {
    const spy: Spy = {};
    const tools = serverWith(
      {
        characters: sheetRow,
        campaigns: campaignRow,
        character_entries: [
          {
            __result: {
              id: "new",
              character_id: CHARACTER_ID,
              kind: "skill",
              name: "Stealth",
              sort_order: 3,
            },
          },
        ],
      },
      USER,
      spy,
    );
    const result = await tools["add_character_entry"]!.handler({
      character_id: CHARACTER_ID,
      kind: "skill",
      name: "Stealth",
      sort_order: 3,
    });
    expect((spy.inserted as Record<string, unknown>)["sort_order"]).toBe(3);
    expect(result.content[0]!.text).toContain("entry_id: new");
    expect(result.content[0]!.text).toContain('"sort_order": 3');
  });
});

describe("update_entry expansion", () => {
  const locationRow = {
    id: ENTITY_ID,
    campaign_id: CAMPAIGN,
    kind: "LOCATION",
    name: "Vault",
    status: "Intact",
    parent_id: null,
  };
  const PARENT = "55555555-5555-4555-8555-555555555555";

  function tools(entities: TableResult[], spy?: Spy) {
    return serverWith({ entities, campaigns: campaignRow }, GM, spy);
  }

  it("replaces data and aliases wholesale and returns the full row", async () => {
    const spy: Spy = {};
    const result = await tools(
      [
        { __result: locationRow },
        { __result: { ...locationRow, data: { a: 1 }, aliases: ["Vault"] } },
      ],
      spy,
    )["update_entry"]!.handler({ entry_id: ENTITY_ID, data: { a: 1 }, aliases: ["Vault"] });
    expect(spy.updated).toEqual({ data: { a: 1 }, aliases: ["Vault"] });
    expect(result.content[0]!.text).toContain('"aliases"');
  });

  it("rejects an unknown kind and an invalid status", async () => {
    await expectFailure(
      tools([{ __result: locationRow }])["update_entry"]!.handler({
        entry_id: ENTITY_ID,
        kind: "SPACESHIP",
      }),
      /Unknown entry kind/,
    );
    await expectFailure(
      tools([{ __result: locationRow }])["update_entry"]!.handler({
        entry_id: ENTITY_ID,
        status: "Vaporised",
      }),
      /Valid statuses/,
    );
  });

  it("accepts a parent in the same campaign and unlinks with null", async () => {
    const parentRow = { id: PARENT, campaign_id: CAMPAIGN, parent_id: null };
    const ok = await tools([
      { __result: locationRow },
      { __result: parentRow },
      { __result: { ...locationRow, parent_id: PARENT } },
    ])["update_entry"]!.handler({ entry_id: ENTITY_ID, parent_id: PARENT });
    expect(ok.content[0]!.text).toContain(PARENT);

    const spy: Spy = {};
    await tools([{ __result: locationRow }, { __result: locationRow }], spy)[
      "update_entry"
    ]!.handler({ entry_id: ENTITY_ID, parent_id: null });
    expect(spy.updated).toEqual({ parent_id: null });
  });

  it("rejects itself as parent, an indirect loop and a parent in another campaign", async () => {
    await expectFailure(
      tools([{ __result: locationRow }])["update_entry"]!.handler({
        entry_id: ENTITY_ID,
        parent_id: ENTITY_ID,
      }),
      /own parent/,
    );
    await expectFailure(
      tools([
        { __result: locationRow },
        { __result: { id: PARENT, campaign_id: CAMPAIGN, parent_id: ENTITY_ID } },
      ])["update_entry"]!.handler({ entry_id: ENTITY_ID, parent_id: PARENT }),
      /loop/,
    );
    await expectFailure(
      tools([
        { __result: locationRow },
        {
          __result: {
            id: PARENT,
            campaign_id: "66666666-6666-4666-8666-666666666666",
            parent_id: null,
          },
        },
      ])["update_entry"]!.handler({ entry_id: ENTITY_ID, parent_id: PARENT }),
      /same campaign/,
    );
  });

  it("rejects an empty patch", async () => {
    await expectFailure(
      tools([{ __result: locationRow }])["update_entry"]!.handler({ entry_id: ENTITY_ID }),
      /Nothing to update/,
    );
  });
});

describe("relationship tools", () => {
  const RELATION = "77777777-7777-4777-8777-777777777777";
  const relationRow = {
    id: RELATION,
    campaign_id: CAMPAIGN,
    source_id: ENTITY_ID,
    target_id: CHARACTER_ID,
    rel_type: "ally",
    strength: 2,
    is_current: true,
  };

  it("bounds strength in both create and update schemas", () => {
    const tools = serverWith({}, GM);
    for (const name of ["create_relationship", "update_relationship"]) {
      const schema = tools[name]!.inputSchema!;
      const base =
        name === "create_relationship"
          ? {
              campaign_id: CAMPAIGN,
              source_id: ENTITY_ID,
              target_id: CHARACTER_ID,
              rel_type: "ally",
            }
          : { relationship_id: RELATION };
      expect(schema.safeParse({ ...base, strength: -5 }).success).toBe(true);
      expect(schema.safeParse({ ...base, strength: 5 }).success).toBe(true);
      expect(schema.safeParse({ ...base, strength: 6 }).success).toBe(false);
      expect(schema.safeParse({ ...base, strength: null }).success).toBe(true);
    }
  });

  it("creates a link with only the values given and reports its id", async () => {
    const spy: Spy = {};
    const tools = serverWith(
      {
        campaigns: campaignRow,
        entities: { ...entityRow, campaign_id: CAMPAIGN },
        entity_relationships: relationRow,
      },
      GM,
      spy,
    );
    const result = await tools["create_relationship"]!.handler({
      campaign_id: CAMPAIGN,
      source_id: ENTITY_ID,
      target_id: CHARACTER_ID,
      rel_type: "ally",
      strength: 2,
    });
    const inserted = spy.inserted as Record<string, unknown>;
    expect(inserted["strength"]).toBe(2);
    expect(inserted).not.toHaveProperty("is_current");
    expect(result.content[0]!.text).toContain(`(${RELATION}).`);
    expect(result.content[0]!.text).toContain('"rel_type": "ally"');
  });

  it("updates and deletes a link for the Game Master only", async () => {
    const spy: Spy = {};
    const updateTools = (userId: string) =>
      serverWith(
        {
          entity_relationships: [
            { __result: relationRow },
            { __result: { ...relationRow, gm_description: null } },
          ],
          campaigns: campaignRow,
        },
        userId,
        spy,
      );
    const updated = await updateTools(GM)["update_relationship"]!.handler({
      relationship_id: RELATION,
      gm_description: null,
    });
    expect(spy.updated).toEqual({ gm_description: null });
    expect(updated.content[0]!.text).toContain('"gm_description": null');
    await expectFailure(
      updateTools(USER)["update_relationship"]!.handler({
        relationship_id: RELATION,
        rel_type: "rival",
      }),
      /Game Master/,
    );

    const deleteTools = (userId: string) =>
      serverWith(
        {
          entity_relationships: [{ __result: relationRow }, { __result: [{ id: RELATION }] }],
          campaigns: campaignRow,
        },
        userId,
      );
    const deleted = await deleteTools(GM)["delete_relationship"]!.handler({
      relationship_id: RELATION,
    });
    expect(deleted.structuredContent).toEqual({ deleted: true, id: RELATION });
    await expectFailure(
      deleteTools(USER)["delete_relationship"]!.handler({ relationship_id: RELATION }),
      /Game Master/,
    );
  });
});

describe("get_character compact mode", () => {
  const longNotes = "n".repeat(400);
  const rows = [{ id: "e1", kind: "skill", name: "Stealth", notes: longNotes }];

  function tools() {
    return serverWith(
      {
        characters: sheetRow,
        campaigns: campaignRow,
        character_entries: [{ __result: rows }, { __result: null, extra: { count: 1 } }],
      },
      USER,
    );
  }

  it("truncates long entry notes only when compact is requested", async () => {
    const compact = await tools()["get_character"]!.handler({
      character_id: CHARACTER_ID,
      compact: true,
    });
    const compactItem = compact.structuredContent["item"] as { entries: { notes: string }[] };
    expect(compactItem.entries[0]!.notes).toHaveLength(200);
    expect(compactItem.entries[0]!.notes.endsWith("…")).toBe(true);
    expect(compact.content[0]!.text).toContain("…");

    const full = await tools()["get_character"]!.handler({ character_id: CHARACTER_ID });
    const fullItem = full.structuredContent["item"] as { entries: { notes: string }[] };
    expect(fullItem.entries[0]!.notes).toBe(longNotes);
  });
});
