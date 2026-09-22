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
    expect(registered).toHaveLength(39);
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length);
  });

  it("keeps every original tool available", () => {
    const original = [
      "list_campaigns",
      "get_campaign",
      "create_campaign",
      "update_campaign",
      "delete_campaign",
      "list_entry_types",
      "list_entries",
      "get_entry",
      "create_entry",
      "update_entry",
      "delete_entry",
      "list_relationships",
      "create_relationship",
      "update_relationship",
      "delete_relationship",
      "list_characters",
      "get_character",
      "create_character",
      "update_character",
      "delete_character",
      "add_character_entry",
      "update_character_entry",
      "delete_character_entry",
    ];
    expect(original).toHaveLength(23);
    for (const name of original) expect(MCP_TOOL_NAMES).toContain(name);
  });

  it("registers the sixteen domain tools", () => {
    const domains = [
      "campaign_members",
      "campaign_knowledge",
      "campaign_notifications",
      "campaign_notes",
      "session_chronicles",
      "history",
      "maps",
      "dice",
      "character_runtime",
      "campaign_assets",
      "campaign_audio",
      "campaign_videos",
      "character_portrait",
      "library",
      "campaign_package",
      "adaptation",
    ];
    expect(domains).toHaveLength(16);
    for (const name of domains) expect(MCP_TOOL_NAMES).toContain(name);
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
    "in",
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

type Spy = { inserted?: unknown; updated?: unknown; rpc?: { fn: string; args: unknown }[] };

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
    rpc: (fn: string, args?: unknown) => {
      if (spy) (spy.rpc ??= []).push({ fn, args });
      return resolve(RPC_TABLES[fn] ?? "entities");
    },
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

/* ------------------------------------------------------------------ */
/* campaign control: get_campaign, delete_campaign, settings           */
/* ------------------------------------------------------------------ */

describe("get_campaign", () => {
  const fullCampaign = {
    id: CAMPAIGN,
    name: "Nadrel",
    description: "A drowned empire.",
    gm_id: GM,
    invite_code: "ABCD1234",
    settings: { point_limit: 150, tech_level: 8 },
  };

  function campaignTools(userId: string) {
    return serverWith(
      {
        campaigns: fullCampaign,
        campaign_members: [{ user_id: USER, role: "player", joined_at: "2026-01-01" }],
        profiles: [{ id: USER, display_name: "Ilma" }],
        entities: { __result: [], extra: { count: 12 } },
        entity_relationships: { __result: [], extra: { count: 3 } },
        characters: { __result: [], extra: { count: 5 } },
      },
      userId,
    );
  }

  it("returns the campaign, the caller's role, members and exact counts", async () => {
    const result = await campaignTools(GM)["get_campaign"]!.handler({ campaign_id: CAMPAIGN });
    const item = result.structuredContent["item"] as Record<string, unknown>;
    expect(item["user_role"]).toBe("gm");
    expect(item["entries_count"]).toBe(12);
    expect(item["relationships_count"]).toBe(3);
    expect(item["characters_count"]).toBe(5);
    expect(item["members"]).toEqual([
      { user_id: USER, display_name: "Ilma", role: "player", joined_at: "2026-01-01" },
    ]);
    expect(result.content[0]!.text).toContain('Campaign "Nadrel" — role: gm.');
    expect(result.content[0]!.text).toContain('"point_limit": 150');
  });

  it("reports the player role for a member", async () => {
    const result = await campaignTools(USER)["get_campaign"]!.handler({ campaign_id: CAMPAIGN });
    expect((result.structuredContent["item"] as Record<string, unknown>)["user_role"]).toBe(
      "player",
    );
  });

  it("refuses a campaign the caller cannot see", async () => {
    await expectFailure(
      serverWith({ campaigns: null }, OUTSIDER)["get_campaign"]!.handler({
        campaign_id: CAMPAIGN,
      }),
      /not found/i,
    );
  });
});

describe("delete_campaign", () => {
  const deleted = {
    deleted: true,
    id: CAMPAIGN,
    entries_deleted: 12,
    relationships_deleted: 3,
    characters_deleted: 2,
    characters_unlinked: 4,
  };

  it("deletes with an exact name confirmation and reports the counts", async () => {
    const spy: Spy = {};
    const tools = serverWith({ campaigns: campaignRow, rpc_delete_campaign: deleted }, GM, spy);
    const result = await tools["delete_campaign"]!.handler({
      campaign_id: CAMPAIGN,
      confirm_name: "Nadrel",
    });
    expect(spy.rpc?.[0]).toEqual({
      fn: "mcp_delete_campaign",
      args: { _campaign: CAMPAIGN, _confirm_name: "Nadrel" },
    });
    expect(result.structuredContent).toEqual(deleted);
    expect(result.content[0]!.text).toContain('Deleted campaign "Nadrel" permanently.');
    expect(result.content[0]!.text).toContain('"characters_unlinked": 4');
  });

  it("refuses a confirmation that differs in capitalisation", async () => {
    await expectFailure(
      serverWith({ campaigns: campaignRow }, GM)["delete_campaign"]!.handler({
        campaign_id: CAMPAIGN,
        confirm_name: "nadrel",
      }),
      /Confirmation name does not match\. Expected: "Nadrel"\./,
    );
  });

  it("refuses anyone who is not the Game Master", async () => {
    await expectFailure(
      serverWith({ campaigns: campaignRow }, USER)["delete_campaign"]!.handler({
        campaign_id: CAMPAIGN,
        confirm_name: "Nadrel",
      }),
      /Only the Game Master/,
    );
  });
});

describe("campaign settings semantics", () => {
  function patchOf(input: Record<string, unknown>) {
    const spy: Spy = {};
    const tools = serverWith({ campaigns: campaignRow, rpc_update_campaign: campaignRow }, GM, spy);
    return tools["update_campaign"]!.handler({ campaign_id: CAMPAIGN, ...input }).then(
      () => (spy.rpc?.[0]?.args as Record<string, unknown>) ?? {},
    );
  }

  it("sends only the settings the caller supplied", async () => {
    const args = await patchOf({ point_limit: 200 });
    expect(args["_settings_patch"]).toEqual({ point_limit: 200 });
    expect(args["_patch"]).toEqual({});
  });

  it("keeps an explicit null so the key is removed", async () => {
    const args = await patchOf({ tech_level: null });
    expect(args["_settings_patch"]).toEqual({ tech_level: null });
  });

  it("sends arrays and objects whole", async () => {
    const args = await patchOf({
      allowed_packs: ["core"],
      ruleset_overrides: { dodgeBase: 4, nested: { keep: null } },
    });
    expect(args["_settings_patch"]).toEqual({
      allowed_packs: ["core"],
      ruleset_overrides: { dodgeBase: 4, nested: { keep: null } },
    });
  });

  it("separates name and premise from the settings patch", async () => {
    const args = await patchOf({ name: "Nadrel II", description: null, house_rules: "No crits" });
    expect(args["_patch"]).toEqual({ name: "Nadrel II", description: null });
    expect(args["_settings_patch"]).toEqual({ house_rules: "No crits" });
  });

  it("still refuses an empty patch", async () => {
    await expectFailure(
      serverWith({ campaigns: campaignRow }, GM)["update_campaign"]!.handler({
        campaign_id: CAMPAIGN,
      }),
      /Nothing to update/,
    );
  });

  it("creates a campaign with only the settings that were supplied", async () => {
    const spy: Spy = {};
    const tools = serverWith({ rpc_create_campaign: campaignRow }, GM, spy);
    await tools["create_campaign"]!.handler({ name: "Nadrel", point_limit: 250 });
    expect(spy.rpc?.[0]).toEqual({
      fn: "mcp_create_campaign",
      args: { _name: "Nadrel", _description: null, _settings_patch: { point_limit: 250 } },
    });
  });

  it("creates a campaign with no settings patch when none were supplied", async () => {
    const spy: Spy = {};
    const tools = serverWith({ rpc_create_campaign: campaignRow }, GM, spy);
    await tools["create_campaign"]!.handler({ name: "Nadrel" });
    expect((spy.rpc?.[0]?.args as Record<string, unknown>)["_settings_patch"]).toEqual({});
  });
});

/* ------------------------------------------------------------------ */
/* status canonicalisation                                             */
/* ------------------------------------------------------------------ */

describe("entry status canonicalisation", () => {
  function createTools(spy: Spy) {
    return serverWith({ campaigns: campaignRow, entities: { id: ENTITY_ID } }, GM, spy);
  }

  const base = { campaign_id: CAMPAIGN, name: "Test" };

  it("stores each kind's own default when no status is given", async () => {
    for (const [kind, expected] of [
      ["QUEST", "AVAILABLE"],
      ["CHAPTER", "Planned"],
      ["LOCATION", "Intact"],
      ["NPC", "Alive"],
    ] as const) {
      const spy: Spy = {};
      await createTools(spy)["create_entry"]!.handler({ ...base, kind });
      expect((spy.inserted as Record<string, unknown>)["status"]).toBe(expected);
    }
  });

  it("accepts any capitalisation and stores the app's spelling", async () => {
    const spy: Spy = {};
    await createTools(spy)["create_entry"]!.handler({
      ...base,
      kind: "LOCATION",
      status: "intact",
    });
    expect((spy.inserted as Record<string, unknown>)["status"]).toBe("Intact");

    const spy2: Spy = {};
    await createTools(spy2)["create_entry"]!.handler({
      ...base,
      kind: "QUEST",
      status: "Completed",
    });
    expect((spy2.inserted as Record<string, unknown>)["status"]).toBe("COMPLETED");
  });

  it("rejects a status the kind does not have, listing the valid ones", async () => {
    await expectFailure(
      createTools({})["create_entry"]!.handler({ ...base, kind: "LOCATION", status: "Ticking" }),
      /Valid statuses: Intact, Damaged, Destroyed, Abandoned, Hidden\./,
    );
  });

  it("canonicalises a status on update", async () => {
    const spy: Spy = {};
    const row = { id: ENTITY_ID, campaign_id: CAMPAIGN, kind: "LOCATION", status: "Intact" };
    const tools = serverWith(
      { campaigns: campaignRow, entities: [{ __result: row }, { __result: row }] },
      GM,
      spy,
    );
    await tools["update_entry"]!.handler({ entry_id: ENTITY_ID, status: "damaged" });
    expect(spy.updated).toEqual({ status: "Damaged" });
  });
});

/* ------------------------------------------------------------------ */
/* exact totals on list tools                                          */
/* ------------------------------------------------------------------ */

describe("list totals", () => {
  it("reports showing N of M with a hint only when more exist", async () => {
    const rows = [
      { id: CAMPAIGN, name: "Nadrel", description: null, gm_id: GM },
      { id: ENTITY_ID, name: "Other", description: null, gm_id: GM },
    ];
    const tools = serverWith(
      { campaigns: [{ __result: rows }, { __result: null, extra: { count: 7 } }] },
      GM,
    );
    const result = await tools["list_campaigns"]!.handler({ limit: 2 });
    expect(result.content[0]!.text).toContain(
      "Showing 2 of 7 campaigns (more may exist — raise limit).",
    );
    expect(result.structuredContent["total"]).toBe(7);
    expect(result.structuredContent["truncated"]).toBe(true);
  });

  it("omits the hint when everything is shown", async () => {
    const tools = serverWith(
      {
        campaigns: [
          { __result: [{ id: CAMPAIGN, name: "Nadrel", description: null, gm_id: GM }] },
          { __result: null, extra: { count: 1 } },
        ],
      },
      GM,
    );
    const result = await tools["list_campaigns"]!.handler({});
    expect(result.content[0]!.text).toContain("Showing 1 of 1 campaigns.");
    expect(result.content[0]!.text).not.toContain("raise limit");
    expect(result.structuredContent["truncated"]).toBe(false);
  });

  it("counts entries with the same filters as the listing", async () => {
    const tools = serverWith(
      {
        campaigns: campaignRow,
        entities: [
          { __result: [{ id: ENTITY_ID, kind: "NPC", name: "Ilma" }] },
          { __result: null, extra: { count: 40 } },
        ],
      },
      GM,
    );
    const result = await tools["list_entries"]!.handler({ campaign_id: CAMPAIGN, limit: 1 });
    expect(result.structuredContent["total"]).toBe(40);
    expect(result.content[0]!.text).toContain('Showing 1 of 40 entries in "Nadrel"');
  });

  it("counts characters with the same campaign filter", async () => {
    const tools = serverWith(
      {
        characters: [
          { __result: [{ id: CHARACTER_ID, name: "Brann", owner_id: USER }] },
          { __result: null, extra: { count: 9 } },
        ],
      },
      USER,
    );
    const result = await tools["list_characters"]!.handler({ campaign_id: CAMPAIGN, limit: 1 });
    expect(result.structuredContent["total"]).toBe(9);
  });
});

describe("list_entry_types", () => {
  it("puts the full catalogue in the text reply as well", async () => {
    const result = await serverWith({}, USER)["list_entry_types"]!.handler({});
    const text = result.content[0]!.text;
    expect(text).toContain("entry types.");
    expect(text).toContain('"kind": "QUEST"');
    expect(text).toContain('"default_status": "AVAILABLE"');
    expect(text).toContain('"ABANDONED"');
    expect(result.structuredContent["total"]).toBe(result.structuredContent["count"]);
  });
});

/* ------------------------------------------------------------------ */
/* numeric validation messages                                         */
/* ------------------------------------------------------------------ */

describe("numeric validation messages", () => {
  function message(tool: string, input: Record<string, unknown>) {
    const tools = serverWith({}, USER) as unknown as Record<
      string,
      {
        inputSchema: {
          safeParse: (v: unknown) => {
            success: boolean;
            error?: { issues: { message: string }[] };
          };
        };
      }
    >;
    const parsed = tools[tool]!.inputSchema.safeParse(input);
    expect(parsed.success).toBe(false);
    return parsed.error!.issues[0]!.message;
  }

  it("names the field and its range", () => {
    expect(message("update_character", { character_id: CAMPAIGN, status: 99 })).toBe(
      "status must be an integer between -20 and 20",
    );
    expect(message("update_character", { character_id: CAMPAIGN, tech_level: 99 })).toBe(
      "tech_level must be an integer between 0 and 20",
    );
    expect(message("update_character", { character_id: CAMPAIGN, st: 1.5 })).toBe(
      "st must be an integer between 0 and 1000",
    );
    expect(message("update_character", { character_id: CAMPAIGN, speed_delta: 0.3 })).toBe(
      "speed_delta must be a multiple of 0.25",
    );
    expect(
      message("add_character_entry", {
        character_id: CAMPAIGN,
        kind: "skill",
        name: "Stealth",
        sort_order: -1,
      }),
    ).toBe("sort_order must be an integer between 0 and 1000000");
    expect(message("list_entries", { campaign_id: CAMPAIGN, limit: 0 })).toBe(
      "limit must be an integer between 1 and 200",
    );
    expect(message("update_campaign", { campaign_id: CAMPAIGN, point_limit: -1 })).toBe(
      "point_limit must be an integer between 0 and 100000",
    );
  });

  it("keeps the strength message exactly as documented", () => {
    expect(
      message("create_relationship", {
        campaign_id: CAMPAIGN,
        source_id: ENTITY_ID,
        target_id: CHARACTER_ID,
        rel_type: "ALLY_OF",
        strength: 9,
      }),
    ).toBe("strength must be an integer between -5 and 5");
  });
});

/* ------------------------------------------------------------------ */
/* character campaign_id stays a Game Master decision                  */
/* ------------------------------------------------------------------ */

describe("moving a character between campaigns", () => {
  const ownedRow = {
    id: CHARACTER_ID,
    name: "Brann Ashfall",
    owner_id: USER,
    campaign_id: CAMPAIGN,
  };

  it("surfaces the refusal when a non-GM owner tries to detach their sheet", async () => {
    const tools = serverWith(
      {
        characters: [
          { __result: ownedRow },
          {
            __result: null,
            extra: { error: { message: "Only the campaign GM can move or detach this character" } },
          },
        ],
        campaigns: campaignRow,
      },
      USER,
    );
    await expectFailure(
      tools["update_character"]!.handler({ character_id: CHARACTER_ID, campaign_id: null }),
      /Only the campaign GM can move or detach this character/,
    );
  });

  it("surfaces the refusal when a non-GM owner tries to move it to another campaign", async () => {
    const other = "44444444-4444-4444-8444-444444444444";
    const tools = serverWith(
      {
        characters: [
          { __result: ownedRow },
          {
            __result: null,
            extra: { error: { message: "Only the campaign GM can move or detach this character" } },
          },
        ],
        campaigns: { ...campaignRow, id: other },
      },
      USER,
    );
    await expectFailure(
      tools["update_character"]!.handler({ character_id: CHARACTER_ID, campaign_id: other }),
      /Only the campaign GM can move or detach this character/,
    );
  });
});

/* ------------------------------------------------------------------ */
/* optional pack linking                                               */
/* ------------------------------------------------------------------ */

describe("pack linking contracts", () => {
  const UUID = "11111111-1111-4111-8111-111111111111";

  function schemas() {
    const server = buildMcpServer(fakeContext());
    return (
      server as unknown as {
        _registeredTools: Record<
          string,
          {
            description?: string;
            inputSchema?: { safeParse: (value: unknown) => { success: boolean } };
          }
        >;
      }
    )._registeredTools;
  }

  it("accepts a direct pack item or a name match when adding an entry", () => {
    const schema = schemas()["add_character_entry"]?.inputSchema;
    const base = { character_id: UUID, kind: "skill", name: "Stealth" };
    expect(schema!.safeParse({ ...base, pack_entry_id: UUID }).success).toBe(true);
    expect(schema!.safeParse({ ...base, match_pack: true }).success).toBe(true);
    expect(schema!.safeParse(base).success).toBe(true);
  });

  it("accepts detaching or re-pointing an existing entry", () => {
    const schema = schemas()["update_character_entry"]?.inputSchema;
    expect(schema!.safeParse({ entry_id: UUID, unlink: true }).success).toBe(true);
    expect(schema!.safeParse({ entry_id: UUID, pack_entry_id: UUID }).success).toBe(true);
    expect(schema!.safeParse({ entry_id: UUID, match_pack: true }).success).toBe(true);
  });

  it("offers pack search inside the single library tool", () => {
    const tools = schemas();
    expect(tools["library"]).toBeDefined();
    expect(tools["library"]?.inputSchema!.safeParse({ action: "search_pack_entries", query: "Stealth" }).success).toBe(true);
    // Deprecated `name` alias still parses, for one release of backward compatibility.
    expect(tools["library"]?.inputSchema!.safeParse({ action: "search_pack_entries", name: "Stealth" }).success).toBe(true);
    expect(tools["library"]?.inputSchema!.safeParse({ action: "list_packs" }).success).toBe(true);
    expect(tools["library"]?.description).toContain("search_pack_entries");
  });

  it("offers character validation inside the character runtime tool", () => {
    const schema = schemas()["character_runtime"]?.inputSchema;
    expect(schema!.safeParse({ action: "validate", character_id: UUID }).success).toBe(true);
  });

  it("does not add any new tool", () => {
    expect(MCP_TOOL_NAMES).toHaveLength(39);
  });
});
