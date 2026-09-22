import { describe, expect, it, vi, afterEach } from "vitest";
import { buildMcpServer } from "@/lib/mcp/tools.server";
import {
  assertPublicHttpsUrl,
  decodeBase64File,
  fetchRemoteFile,
} from "@/lib/mcp/uploads.server";

/* ------------------------------------------------------------------ */
/* Shared fake-Supabase plumbing (mirrors src/rules/__tests__/mcp-tools.test.ts) */
/* ------------------------------------------------------------------ */

type ToolResult = {
  content: { type: "text"; text: string }[];
  structuredContent: Record<string, unknown>;
};

interface RegisteredTool {
  handler: (input: Record<string, unknown>) => Promise<ToolResult>;
  inputSchema?: { safeParse: (value: unknown) => { success: boolean } };
}

type Spy = {
  inserted?: unknown[];
  updated?: unknown[];
  deleted?: string[];
  rpc?: { fn: string; args: unknown }[];
};

type QueueItem = { __result: unknown; extra?: Record<string, unknown> };
type TableValue = unknown | QueueItem[];

/** Chainable thenable standing in for a supabase-js query builder. */
function query(data: unknown, extra: Record<string, unknown> = {}, spy?: Spy) {
  const self: Record<string, unknown> = {};
  for (const method of [
    "select",
    "eq",
    "order",
    "limit",
    "ilike",
    "single",
    "maybeSingle",
    "in",
  ]) {
    self[method] = () => self;
  }
  self["update"] = (payload: unknown) => {
    if (spy) (spy.updated ??= []).push(payload);
    return self;
  };
  self["insert"] = (payload: unknown) => {
    if (spy) (spy.inserted ??= []).push(payload);
    return self;
  };
  self["delete"] = () => {
    if (spy) (spy.deleted ??= []).push("delete");
    return self;
  };
  self["then"] = (resolve: (value: unknown) => unknown) =>
    Promise.resolve({ data, error: null, ...extra }).then(resolve);
  return self;
}

function rpcResult(data: unknown, error: { message: string } | null) {
  const self: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve),
  };
  self["single"] = () => self;
  return self;
}

type RpcImpl = (fn: string, args: unknown) => { data: unknown; error: { message: string } | null };

function makeClient(tables: Record<string, TableValue>, rpcImpl?: RpcImpl, spy?: Spy) {
  const queues: Record<string, QueueItem[]> = {};
  for (const [table, value] of Object.entries(tables)) {
    if (Array.isArray(value) && value.some((v) => v && typeof v === "object" && "__result" in v)) {
      queues[table] = value as QueueItem[];
    }
  }
  const resolve = (table: string) => {
    const queued = queues[table];
    const raw = queued && queued.length > 0 ? queued.shift() : tables[table];
    if (raw && typeof raw === "object" && "__result" in raw) {
      const wrapped = raw as QueueItem;
      return query(wrapped.__result, wrapped.extra ?? {}, spy);
    }
    return query(raw, {}, spy);
  };
  return {
    from: (table: string) => resolve(table),
    rpc: (fn: string, args?: unknown) => {
      if (spy) (spy.rpc ??= []).push({ fn, args });
      if (rpcImpl) {
        const { data, error } = rpcImpl(fn, args);
        return rpcResult(data, error);
      }
      return rpcResult(null, null);
    },
  };
}

function serverWith(
  tables: Record<string, TableValue>,
  userId: string,
  opts: { rpc?: RpcImpl; spy?: Spy } = {},
) {
  const supabase = makeClient(tables, opts.rpc, opts.spy);
  const server = buildMcpServer({ supabase: supabase as never, userId });
  return (server as unknown as { _registeredTools: Record<string, RegisteredTool> })
    ._registeredTools;
}

async function expectFailure(run: Promise<unknown>, match: RegExp) {
  await expect(run).rejects.toThrow(match);
}

const GM = "00000000-0000-0000-0000-0000000000ff";
const USER = "00000000-0000-0000-0000-000000000001";
const OUTSIDER = "99999999-9999-4999-8999-999999999999";
const CAMPAIGN = "11111111-1111-4111-8111-111111111111";
const campaignRow = { id: CAMPAIGN, name: "Nadrel", gm_id: GM };

/* ==================================================================== */
/* campaign_members                                                      */
/* ==================================================================== */

describe("campaign_members", () => {
  it("refuses rotate_invite for a non-GM", async () => {
    const tools = serverWith({ campaigns: campaignRow }, USER);
    await expectFailure(
      tools["campaign_members"]!.handler({ action: "rotate_invite", campaign_id: CAMPAIGN }),
      /Only the Game Master.*rotate the invite code/,
    );
  });

  it("refuses transfer_gm for a non-GM", async () => {
    const tools = serverWith({ campaigns: campaignRow }, USER);
    await expectFailure(
      tools["campaign_members"]!.handler({
        action: "transfer_gm",
        campaign_id: CAMPAIGN,
        new_gm_user_id: OUTSIDER,
      }),
      /Only the Game Master.*transfer Game Master control/,
    );
  });

  it("refuses to remove the current GM and points to transfer_gm", async () => {
    const tools = serverWith({ campaigns: campaignRow }, GM);
    await expectFailure(
      tools["campaign_members"]!.handler({
        action: "remove",
        campaign_id: CAMPAIGN,
        user_id: GM,
      }),
      /Cannot remove the current Game Master.*transfer_gm/,
    );
  });

  it("refuses set_role('player') on the current GM", async () => {
    const tools = serverWith({ campaigns: campaignRow }, GM);
    await expectFailure(
      tools["campaign_members"]!.handler({
        action: "set_role",
        campaign_id: CAMPAIGN,
        user_id: GM,
        role: "player",
      }),
      /Cannot demote the current Game Master directly.*transfer_gm/,
    );
  });
});

/* ==================================================================== */
/* campaign_knowledge                                                    */
/* ==================================================================== */

describe("campaign_knowledge", () => {
  const entityRow = {
    id: "22222222-2222-4222-8222-222222222222",
    name: "Vault of Echoes",
    kind: "location",
    campaign_id: CAMPAIGN,
  };

  it("grant promotes GM_ONLY to SELECTED_PLAYERS", async () => {
    const tools = serverWith(
      { campaigns: campaignRow, entities: entityRow, notifications: null },
      GM,
      {
        rpc: (fn) => {
          if (fn === "grant_entity_knowledge") {
            return {
              data: {
                grant_id: "g1",
                entity_id: entityRow.id,
                user_id: OUTSIDER,
                promoted_to: "SELECTED_PLAYERS",
                visibility: "SELECTED_PLAYERS",
              },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      },
    );
    const result = await tools["campaign_knowledge"]!.handler({
      action: "grant",
      campaign_id: CAMPAIGN,
      entity_id: entityRow.id,
      user_id: OUTSIDER,
    });
    const item = result.structuredContent["item"] as Record<string, unknown>;
    expect(item["visibility"]).toBe("SELECTED_PLAYERS");
    expect(item["promoted_to"]).toBe("SELECTED_PLAYERS");
  });

  it("GM cannot reveal an entry to self", async () => {
    const tools = serverWith(
      { campaigns: campaignRow, entities: entityRow },
      GM,
      {
        rpc: (fn, args) => {
          if (fn === "grant_entity_knowledge" && (args as { _user: string })._user === GM) {
            return { data: null, error: { message: "The Game Master already sees every entry." } };
          }
          return { data: {}, error: null };
        },
      },
    );
    await expectFailure(
      tools["campaign_knowledge"]!.handler({
        action: "grant",
        campaign_id: CAMPAIGN,
        entity_id: entityRow.id,
        user_id: GM,
      }),
      /already sees every entry/,
    );
  });

  it("revoking the last grant demotes the entry back to GM_ONLY", async () => {
    const grantRow = { id: "g1", campaign_id: CAMPAIGN };
    const tools = serverWith(
      { campaigns: campaignRow, knowledge_grants: grantRow },
      GM,
      {
        rpc: (fn) => {
          if (fn === "revoke_entity_knowledge") {
            return {
              data: { deleted: true, id: "g1", remaining_grants: 0, demoted: true },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      },
    );
    const result = await tools["campaign_knowledge"]!.handler({ action: "revoke", grant_id: "g1" });
    const item = result.structuredContent["item"] as Record<string, unknown>;
    expect(item["demoted"]).toBe(true);
  });

  it("refuses grant/revoke for a non-GM", async () => {
    const grantTools = serverWith({ campaigns: campaignRow, entities: entityRow }, USER);
    await expectFailure(
      grantTools["campaign_knowledge"]!.handler({
        action: "grant",
        campaign_id: CAMPAIGN,
        entity_id: entityRow.id,
        user_id: OUTSIDER,
      }),
      /Only the Game Master/,
    );

    const revokeTools = serverWith(
      { campaigns: campaignRow, knowledge_grants: { id: "g1", campaign_id: CAMPAIGN } },
      USER,
    );
    await expectFailure(
      revokeTools["campaign_knowledge"]!.handler({ action: "revoke", grant_id: "g1" }),
      /Only the Game Master.*revoke reveals/,
    );
  });
});

/* ==================================================================== */
/* campaign_notes                                                        */
/* ==================================================================== */

describe("campaign_notes", () => {
  it("accepts exactly the canonical note kinds", () => {
    const tools = serverWith({}, USER);
    const schema = tools["campaign_notes"]!.inputSchema!;
    for (const kind of ["note", "handout", "session", "session-prep", "rule"]) {
      expect(
        schema.safeParse({ action: "create", campaign_id: CAMPAIGN, kind, title: "T" }).success,
      ).toBe(true);
    }
    expect(
      schema.safeParse({ action: "create", campaign_id: CAMPAIGN, kind: "lore", title: "T" })
        .success,
    ).toBe(false);
  });

  it("gives a friendly not-found error when RLS hides a gm_only note from a player", async () => {
    // RLS filters the row out entirely, so the select returns no row.
    const tools = serverWith({ campaign_notes: null }, USER);
    await expectFailure(
      tools["campaign_notes"]!.handler({ action: "get", note_id: "33333333-3333-4333-8333-333333333333" }),
      /Note not found, or you do not have access to it\./,
    );
  });
});

/* ==================================================================== */
/* session_chronicles                                                    */
/* ==================================================================== */

describe("session_chronicles", () => {
  it("requires the GM to create a chronicle", async () => {
    const tools = serverWith({ campaigns: campaignRow }, USER);
    await expectFailure(
      tools["session_chronicles"]!.handler({
        action: "create",
        campaign_id: CAMPAIGN,
        title: "Session 1",
      }),
      /Only the Game Master.*create session chronicles/,
    );
  });
});

/* ==================================================================== */
/* history                                                                */
/* ==================================================================== */

describe("history", () => {
  it("restores an entry revision through the atomic RPC only", async () => {
    const spy: Spy = {};
    const tools = serverWith({}, USER, {
      spy,
      rpc: (fn) => {
        if (fn === "restore_entity_revision") {
          return { data: { id: "e1", name: "Vault" }, error: null };
        }
        return { data: null, error: null };
      },
    });
    const result = await tools["history"]!.handler({
      action: "restore_entry_revision",
      revision_id: "44444444-4444-4444-8444-444444444444",
    });
    expect(spy.rpc).toEqual([
      { fn: "restore_entity_revision", args: { _revision: "44444444-4444-4444-8444-444444444444" } },
    ]);
    expect(spy.updated).toBeUndefined();
    expect(spy.inserted).toBeUndefined();
    expect((result.structuredContent["item"] as Record<string, unknown>)["name"]).toBe("Vault");
  });

  it("restores a character version through the atomic RPC only", async () => {
    const spy: Spy = {};
    const tools = serverWith({}, USER, {
      spy,
      rpc: (fn) => {
        if (fn === "restore_character_version") {
          return { data: { id: "c1", name: "Brann" }, error: null };
        }
        return { data: null, error: null };
      },
    });
    await tools["history"]!.handler({
      action: "restore_character_version",
      version_id: "55555555-5555-4555-8555-555555555555",
    });
    expect(spy.rpc).toEqual([
      {
        fn: "restore_character_version",
        args: { _version: "55555555-5555-4555-8555-555555555555" },
      },
    ]);
    expect(spy.updated).toBeUndefined();
    expect(spy.inserted).toBeUndefined();
  });
});

/* ==================================================================== */
/* maps                                                                   */
/* ==================================================================== */

describe("maps", () => {
  const MAP_ID = "66666666-6666-4666-8666-666666666666";
  const mapRow = {
    id: MAP_ID,
    campaign_id: CAMPAIGN,
    name: "Battle Map",
    visible_to_players: true,
    image_path: null,
  };
  const objects = [
    { id: "o1", map_id: MAP_ID, campaign_id: CAMPAIGN, hidden: false, owner_user_id: null, character_id: null },
    { id: "o2", map_id: MAP_ID, campaign_id: CAMPAIGN, hidden: true, owner_user_id: GM, character_id: null },
  ];

  it("excludes hidden objects for a player but shows everything to the GM", async () => {
    const playerTools = serverWith(
      {
        campaigns: campaignRow,
        campaign_members: { user_id: USER },
        maps: [{ __result: mapRow }, { __result: mapRow }],
        map_objects: [{ __result: objects }],
        characters: [],
      },
      USER,
    );
    const playerResult = await playerTools["maps"]!.handler({
      action: "list_objects",
      map_id: MAP_ID,
    });
    const playerItems = playerResult.structuredContent["items"] as unknown[];
    expect(playerItems).toHaveLength(1);

    const gmTools = serverWith(
      {
        campaigns: campaignRow,
        maps: [{ __result: mapRow }],
        map_objects: [{ __result: objects }, { __result: null, extra: { count: 2 } }],
      },
      GM,
    );
    const gmResult = await gmTools["maps"]!.handler({ action: "list_objects", map_id: MAP_ID });
    const gmItems = gmResult.structuredContent["items"] as unknown[];
    expect(gmItems).toHaveLength(2);
  });

  it("does not return a map hidden from players", async () => {
    const hiddenMap = { ...mapRow, visible_to_players: false };
    const tools = serverWith(
      { campaigns: campaignRow, maps: hiddenMap },
      USER,
    );
    await expectFailure(
      tools["maps"]!.handler({ action: "get", map_id: MAP_ID }),
      /Map not found, or you do not have access to it\./,
    );
  });
});

/* ==================================================================== */
/* dice                                                                   */
/* ==================================================================== */

describe("dice", () => {
  it("computes the roll server-side; a caller-supplied total is not part of the schema", async () => {
    const schema = serverWith({}, USER)["dice"]!.inputSchema!;
    const parsed = schema.safeParse({
      action: "roll",
      label: "Attack",
      expression: "3d6",
      // A caller cannot smuggle a pre-computed total through the schema.
      total: 999,
    }) as { success: boolean; data?: Record<string, unknown> };
    expect(parsed.success).toBe(true);
    expect(parsed.data).not.toHaveProperty("total");

    const spy: Spy = {};
    const tools = serverWith({ roll_history: { id: "r1" } }, USER, { spy });
    const result = await tools["dice"]!.handler({
      action: "roll",
      label: "Attack",
      expression: "3d6",
    });
    const insert = (spy.inserted?.[0] ?? {}) as Record<string, unknown>;
    const total = insert["total"] as number;
    expect(total).toBeGreaterThanOrEqual(3);
    expect(total).toBeLessThanOrEqual(18);
    expect(result.content[0]!.text).toContain(`→ ${total}`);
  });

  it("rejects an invalid dice expression with a clear message", async () => {
    const tools = serverWith({}, USER);
    await expectFailure(
      tools["dice"]!.handler({ action: "roll", label: "Attack", expression: "not-dice" }),
      /is not a valid dice expression/,
    );
  });
});

/* ==================================================================== */
/* character_runtime                                                     */
/* ==================================================================== */

describe("character_runtime", () => {
  const ENTRY_ID = "77777777-7777-4777-8777-777777777777";

  it("delegates adjust_ammo to the adjust_weapon_ammo RPC", async () => {
    const spy: Spy = {};
    const tools = serverWith({}, USER, {
      spy,
      rpc: (fn) => {
        if (fn === "adjust_weapon_ammo") return { data: { current_shots: 0 }, error: null };
        return { data: null, error: null };
      },
    });
    const result = await tools["character_runtime"]!.handler({
      action: "adjust_ammo",
      character_entry_id: ENTRY_ID,
      mode_key: "mode:0",
      delta: -100,
    });
    expect(spy.rpc).toEqual([
      {
        fn: "adjust_weapon_ammo",
        args: { _entry: ENTRY_ID, _mode: "mode:0", _delta: -100 },
      },
    ]);
    // Clamped at zero server-side; the domain surfaces whatever the RPC returns.
    expect((result.structuredContent["item"] as Record<string, unknown>)["current_shots"]).toBe(0);
  });

  it("surfaces a permission error from the RPC for an unrelated user", async () => {
    const tools = serverWith({}, OUTSIDER, {
      rpc: (fn) => {
        if (fn === "adjust_weapon_ammo") {
          return { data: null, error: { message: "permission denied" } };
        }
        return { data: null, error: null };
      },
    });
    await expectFailure(
      tools["character_runtime"]!.handler({
        action: "adjust_ammo",
        character_entry_id: ENTRY_ID,
        mode_key: "mode:0",
        delta: 1,
      }),
      /Adjusting weapon ammo failed: permission denied/,
    );
  });
});

/* ==================================================================== */
/* campaign_assets / campaign_audio / campaign_videos                    */
/* ==================================================================== */

describe("campaign_assets", () => {
  const visibleAsset = {
    id: "a1",
    campaign_id: CAMPAIGN,
    title: "Public map",
    visible_to_players: true,
  };
  const hiddenAsset = {
    id: "a2",
    campaign_id: CAMPAIGN,
    title: "GM secret",
    visible_to_players: false,
  };

  it("excludes hidden assets for a player but shows all to the GM", async () => {
    const playerTools = serverWith(
      {
        campaigns: campaignRow,
        campaign_members: { user_id: USER },
        campaign_assets: [{ __result: [visibleAsset] }, { __result: null, extra: { count: 1 } }],
      },
      USER,
    );
    const playerResult = await playerTools["campaign_assets"]!.handler({
      action: "list",
      campaign_id: CAMPAIGN,
    });
    expect(playerResult.structuredContent["items"]).toHaveLength(1);

    const gmTools = serverWith(
      {
        campaigns: campaignRow,
        campaign_members: { user_id: GM },
        campaign_assets: [
          { __result: [visibleAsset, hiddenAsset] },
          { __result: null, extra: { count: 2 } },
        ],
      },
      GM,
    );
    const gmResult = await gmTools["campaign_assets"]!.handler({
      action: "list",
      campaign_id: CAMPAIGN,
    });
    expect(gmResult.structuredContent["items"]).toHaveLength(2);
  });

  it("refuses set_visibility for a non-GM", async () => {
    const tools = serverWith(
      { campaigns: campaignRow, campaign_assets: hiddenAsset },
      USER,
    );
    await expectFailure(
      tools["campaign_assets"]!.handler({
        action: "set_visibility",
        asset_id: "a2",
        visible_to_players: true,
      }),
      /Only the Game Master.*change asset visibility/,
    );
  });
});

describe("campaign_audio", () => {
  it("refuses set_album_visibility for a non-GM", async () => {
    const albumRow = { id: "al1", campaign_id: CAMPAIGN, cover_path: "x" };
    const tools = serverWith(
      { campaigns: campaignRow, campaign_soundtrack_albums: albumRow },
      USER,
    );
    await expectFailure(
      tools["campaign_audio"]!.handler({
        action: "set_album_visibility",
        album_id: "al1",
        visible_to_players: true,
      }),
      /Only the Game Master/,
    );
  });
});

describe("campaign_videos", () => {
  const visibleVideo = { id: "v1", campaign_id: CAMPAIGN, title: "Recap", visible_to_players: true };
  const hiddenVideo = { id: "v2", campaign_id: CAMPAIGN, title: "Secret cut", visible_to_players: false };

  it("excludes hidden videos for a player but shows all to the GM", async () => {
    const playerTools = serverWith(
      {
        campaigns: campaignRow,
        campaign_members: { user_id: USER },
        campaign_videos: [{ __result: [visibleVideo] }, { __result: null, extra: { count: 1 } }],
      },
      USER,
    );
    const playerResult = await playerTools["campaign_videos"]!.handler({
      action: "list",
      campaign_id: CAMPAIGN,
    });
    expect(playerResult.structuredContent["items"]).toHaveLength(1);

    const gmTools = serverWith(
      {
        campaigns: campaignRow,
        campaign_members: { user_id: GM },
        campaign_videos: [
          { __result: [visibleVideo, hiddenVideo] },
          { __result: null, extra: { count: 2 } },
        ],
      },
      GM,
    );
    const gmResult = await gmTools["campaign_videos"]!.handler({
      action: "list",
      campaign_id: CAMPAIGN,
    });
    expect(gmResult.structuredContent["items"]).toHaveLength(2);
  });

  it("refuses set_visibility for a non-GM", async () => {
    const tools = serverWith(
      { campaigns: campaignRow, campaign_videos: hiddenVideo },
      USER,
    );
    await expectFailure(
      tools["campaign_videos"]!.handler({
        action: "set_visibility",
        video_id: "v2",
        visible_to_players: true,
      }),
      /Only the Game Master/,
    );
  });
});

/* ==================================================================== */
/* character_portrait                                                    */
/* ==================================================================== */

describe("character_portrait", () => {
  const CHARACTER_ID = "88888888-8888-4888-8888-888888888888";
  const characterRow = {
    id: CHARACTER_ID,
    name: "Brann Ashfall",
    owner_id: USER,
    campaign_id: CAMPAIGN,
    portrait_path: null,
  };

  it("refuses clear for someone who is neither the owner nor the campaign GM", async () => {
    const tools = serverWith({ characters: characterRow, campaigns: campaignRow }, OUTSIDER);
    await expectFailure(
      tools["character_portrait"]!.handler({ action: "clear", character_id: CHARACTER_ID }),
      /Only the owner.*or their campaign's Game Master/,
    );
  });
});

/* ==================================================================== */
/* library                                                                */
/* ==================================================================== */

describe("library", () => {
  const OWNER = USER;
  const entryRow = { id: "le1", owner_id: OWNER, name: "Combat Reflexes" };
  const packRow = { id: "p1", owner_id: OWNER, name: "My Pack" };

  it("refuses to let another user update someone else's library entry", async () => {
    const tools = serverWith({ library_entries: entryRow }, OUTSIDER);
    await expectFailure(
      tools["library"]!.handler({ action: "update", entry_id: "le1", name: "Renamed" }),
      /Only the owner of "Combat Reflexes" can update this library entry\./,
    );
  });

  it("refuses to let another user delete someone else's library entry", async () => {
    const tools = serverWith({ library_entries: entryRow }, OUTSIDER);
    await expectFailure(
      tools["library"]!.handler({ action: "delete", entry_id: "le1" }),
      /Only the owner of "Combat Reflexes" can delete this library entry\./,
    );
  });

  it("refuses to let another user update or delete someone else's content pack", async () => {
    const updateTools = serverWith({ content_packs: packRow }, OUTSIDER);
    await expectFailure(
      updateTools["library"]!.handler({ action: "update_pack", pack_id: "p1", description: "x" }),
      /Only the owner of the "My Pack" pack can update it\./,
    );

    const deleteTools = serverWith({ content_packs: packRow }, OUTSIDER);
    await expectFailure(
      deleteTools["library"]!.handler({ action: "delete_pack", pack_id: "p1" }),
      /Only the owner of the "My Pack" pack can delete it\./,
    );
  });

  // PL-012: entry_count must be owner-aware, not just keyed off the pack name.
  it("does not bleed entry counts between two owners' same-named packs", async () => {
    const OTHER_OWNER = OUTSIDER;
    const packs = [
      { id: "p1", owner_id: OWNER, name: "Adventurers' Guide" },
      { id: "p2", owner_id: OTHER_OWNER, name: "Adventurers' Guide" },
    ];
    const entries = [
      { owner_id: OWNER, pack: "Adventurers' Guide" },
      { owner_id: OWNER, pack: "Adventurers' Guide" },
      { owner_id: OTHER_OWNER, pack: "Adventurers' Guide" },
    ];
    const tools = serverWith(
      {
        content_packs: [{ __result: packs }, { __result: packs, extra: { count: packs.length } }],
        library_entries: entries,
      },
      OWNER,
    );
    const result = await tools["library"]!.handler({ action: "list_packs" });
    const items = result.structuredContent["items"] as Array<Record<string, unknown>>;
    const mine = items.find((row) => row["owner_id"] === OWNER)!;
    const theirs = items.find((row) => row["owner_id"] === OTHER_OWNER)!;
    expect(mine["entry_count"]).toBe(2);
    expect(theirs["entry_count"]).toBe(1);
  });

  // PL-013: search_pack_entries canonical/deprecated input and full output contract.
  describe("search_pack_entries", () => {
    const candidateEntry = {
      id: "ce1",
      owner_id: OWNER,
      kind: "skill",
      name: "Stealth",
      category: "Physical",
      base_points: 4,
      cost_per_level: 1,
      max_levels: 4,
      pack: "My Pack",
      data: { defaults: "DX-5", prerequisites: "None", attribute: "DX", difficulty: "A" },
    };

    it("accepts the canonical query field and returns the full candidate view", async () => {
      const tools = serverWith(
        { library_entries: [candidateEntry], content_packs: [packRow] },
        OWNER,
      );
      const result = await tools["library"]!.handler({
        action: "search_pack_entries",
        query: "Stealth",
      });
      const items = result.structuredContent["items"] as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
      const item = items[0]!;
      for (const field of [
        "id",
        "name",
        "kind",
        "category",
        "pack_id",
        "pack_name",
        "base_points",
        "cost_per_level",
        "max_levels",
        "difficulty",
        "attribute",
        "defaults",
        "prerequisites",
        "specialization",
        "specialization_required",
        "pack_version",
      ]) {
        expect(item).toHaveProperty(field);
      }
      expect(item["defaults"]).toBe("DX-5");
      expect(item["prerequisites"]).toBe("None");
    });

    it("still accepts the deprecated name alias", async () => {
      const tools = serverWith(
        { library_entries: [candidateEntry], content_packs: [packRow] },
        OWNER,
      );
      const result = await tools["library"]!.handler({
        action: "search_pack_entries",
        name: "Stealth",
      });
      const items = result.structuredContent["items"] as Array<Record<string, unknown>>;
      expect(items).toHaveLength(1);
    });

    it("rejects a call with neither query nor name", async () => {
      const tools = serverWith({ library_entries: [candidateEntry], content_packs: [packRow] }, OWNER);
      await expectFailure(
        tools["library"]!.handler({ action: "search_pack_entries" }),
        /needs a query/,
      );
    });
  });
});

/* ==================================================================== */
/* campaign_package                                                      */
/* ==================================================================== */

describe("campaign_package", () => {
  it("denies export for a campaign the caller cannot access (or is not GM of)", async () => {
    const tools = serverWith({ campaigns: campaignRow }, USER);
    await expectFailure(
      tools["campaign_package"]!.handler({ action: "export", campaign_id: CAMPAIGN }),
      /Only the Game Master.*export this campaign/,
    );
  });

  it("validates a staged package before any import write, and rejects an invalid one", async () => {
    const tools = serverWith({}, USER);
    // finalize_import requires the file to be under the caller's own storage
    // prefix; a foreign path is refused before any storage or schema check.
    await expectFailure(
      tools["campaign_package"]!.handler({
        action: "finalize_import",
        storage_path: "someone-else/package.zip",
      }),
      /does not belong to you/,
    );
  });

  it("only lets the caller delete a staged file under their own prefix", async () => {
    const tools = serverWith({}, USER);
    await expectFailure(
      tools["campaign_package"]!.handler({
        action: "delete_staged",
        storage_path: "someone-else/package.zip",
      }),
      /does not belong to you/,
    );
  });
});

/* ==================================================================== */
/* adaptation                                                             */
/* ==================================================================== */

describe("adaptation", () => {
  it("refuses GM-only actions for a non-GM caller", async () => {
    const tools = serverWith({ campaigns: campaignRow }, USER);
    await expectFailure(
      tools["adaptation"]!.handler({
        action: "create_project",
        campaign_id: CAMPAIGN,
        name: "My Adaptation",
      }),
      /Only the Game Master.*create adaptation projects/,
    );
  });

  it("refuses reads for a non-GM caller too — the Studio is GM-only end to end", async () => {
    const tools = serverWith({ campaigns: campaignRow }, USER);
    await expectFailure(
      tools["adaptation"]!.handler({ action: "list_projects", campaign_id: CAMPAIGN }),
      /Only the Game Master.*view its adaptation projects/,
    );
  });
});

/* ==================================================================== */
/* uploads.server.ts (tested directly)                                   */
/* ==================================================================== */

describe("uploads.server: assertPublicHttpsUrl", () => {
  it("rejects non-https URLs", () => {
    expect(() => assertPublicHttpsUrl("http://example.com/file.png")).toThrow(
      /Only https addresses are accepted/,
    );
    expect(() => assertPublicHttpsUrl("ftp://example.com/file.png")).toThrow(
      /Only https addresses are accepted/,
    );
  });

  it("rejects localhost and loopback hosts", () => {
    expect(() => assertPublicHttpsUrl("https://localhost/file.png")).toThrow(
      /not accepted/,
    );
    expect(() => assertPublicHttpsUrl("https://127.0.0.1/file.png")).toThrow(/not accepted/);
  });

  it("rejects the cloud metadata address", () => {
    expect(() => assertPublicHttpsUrl("https://169.254.169.254/latest/meta-data")).toThrow(
      /not accepted/,
    );
  });

  it("rejects RFC1918 private addresses", () => {
    expect(() => assertPublicHttpsUrl("https://10.0.0.5/file.png")).toThrow(/not accepted/);
    expect(() => assertPublicHttpsUrl("https://172.16.0.5/file.png")).toThrow(/not accepted/);
    expect(() => assertPublicHttpsUrl("https://192.168.1.5/file.png")).toThrow(/not accepted/);
  });

  it("accepts a plain public https address", () => {
    expect(() => assertPublicHttpsUrl("https://example.com/file.png")).not.toThrow();
  });
});

describe("uploads.server: decodeBase64File", () => {
  it("rejects a disallowed MIME type", () => {
    const data = Buffer.from("hello").toString("base64");
    expect(() =>
      decodeBase64File(data, "application/x-executable", {
        maxBytes: 1000,
        allowedMime: ["image/png"],
      }),
    ).toThrow(/Unsupported file type/);
  });

  it("rejects an over-size payload", () => {
    const bigData = Buffer.from("a".repeat(1000)).toString("base64");
    expect(() =>
      decodeBase64File(bigData, "image/png", { maxBytes: 10, allowedMime: ["image/png"] }),
    ).toThrow(/too large/);
  });

  it("accepts an allowed small payload under the size cap", () => {
    const bytes = Buffer.from("hello world");
    const data = bytes.toString("base64");
    const file = decodeBase64File(data, "image/png", { maxBytes: 1000, allowedMime: ["image/png"] });
    expect(file.mime).toBe("image/png");
    expect(file.size).toBe(bytes.byteLength);
  });
});

describe("uploads.server: downloading from a web address is off", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  // The runtime cannot prove that a hostname resolves only to public addresses
  // and cannot pin the connection to a verified address, so the feature is
  // refused outright rather than shipped with partial protection.
  it("refuses every call without touching the network", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    await expect(
      fetchRemoteFile("https://example.com/file.png", { maxBytes: 1000, allowedMime: ["image/png"] }),
    ).rejects.toThrow();
    await expect(
      fetchRemoteFile("http://example.com/file.png", { maxBytes: 1000, allowedMime: ["image/png"] }),
    ).rejects.toThrow();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
