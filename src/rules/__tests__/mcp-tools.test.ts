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
    expect(registered).toHaveLength(15);
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
  self["insert"] = (payload: unknown) => {
    if (spy) spy.inserted = payload;
    return self;
  };
  self["then"] = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error: null, ...extra }).then(resolve);
  return self;
}

type Spy = { inserted?: unknown };

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
  const supabase = {
    rpc: () => resolve("entities"),
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
    expect(text).toContain('Character "Brann Ashfall" with 2 entries.');
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
    expect(result.content[0]!.text).toContain('Character "Brann Ashfall" with 2 entries.');
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
      'Character "Brann Ashfall" with 2 of 57 entries (more may exist — raise entry_limit).',
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
    expect(result.content[0]!.text).toBe(
      'Added "Stealth" to "Brann Ashfall" (entry_id: 44444444-4444-4444-8444-444444444444).',
    );
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
