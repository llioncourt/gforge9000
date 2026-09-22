/**
 * Tool surface exposed to external assistants (MCP).
 *
 * Server-only. Every handler receives the id of the signed-in user that owns
 * the access key and re-checks campaign access before reading or writing, so
 * the tool layer enforces the same GM / member rules as the app itself.
 */
import { KINDS, kindDef } from "@/lib/entity-kinds";
import { VISIBILITY_VALUES, isPlayerVisible } from "@/lib/visibility";

type Json = Record<string, unknown>;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: Json;
  handler: (args: Json, userId: string) => Promise<unknown>;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- admin client is loosely typed here */
type Admin = any;

async function admin(): Promise<Admin> {
  const mod = await import("@/integrations/supabase/client.server");
  return (mod as unknown as { supabaseAdmin: Admin }).supabaseAdmin;
}

function unwrap<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

function str(args: Json, key: string, required = true): string {
  const value = args[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (required) throw new Error(`Missing required argument "${key}".`);
  return "";
}

function optString(args: Json, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

interface Access {
  isGm: boolean;
  isMember: boolean;
}

async function access(userId: string, campaignId: string): Promise<Access> {
  const db = await admin();
  const campaign = unwrap(
    await db.from("campaigns").select("id, gm_id").eq("id", campaignId).maybeSingle(),
  );
  if (!campaign) throw new Error("Campaign not found.");
  if (campaign.gm_id === userId) return { isGm: true, isMember: true };
  const member = unwrap(
    await db
      .from("campaign_members")
      .select("role")
      .eq("campaign_id", campaignId)
      .eq("user_id", userId)
      .maybeSingle(),
  );
  if (!member) throw new Error("You do not have access to this campaign.");
  return { isGm: member.role === "gm", isMember: true };
}

async function requireGm(userId: string, campaignId: string): Promise<void> {
  const { isGm } = await access(userId, campaignId);
  if (!isGm) throw new Error("Only the campaign's game master can change this.");
}

async function entityCampaign(id: string): Promise<{ campaign_id: string }> {
  const db = await admin();
  const row = unwrap(await db.from("entities").select("campaign_id").eq("id", id).maybeSingle());
  if (!row) throw new Error("Entry not found.");
  return row;
}

function publicEntity(row: Json, isGm: boolean): Json {
  if (isGm) return row;
  const { gm_notes: _gmNotes, ...rest } = row as Record<string, unknown>;
  return rest as Json;
}

const VISIBILITY_ENUM = [...VISIBILITY_VALUES];
const KIND_ENUM = KINDS.map((k) => k.kind);

export const TOOLS: McpTool[] = [
  {
    name: "list_campaigns",
    description: "List the campaigns this user runs or plays in.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    handler: async (_args, userId) => {
      const db = await admin();
      const owned = unwrap(
        await db.from("campaigns").select("id, name, description, gm_id").eq("gm_id", userId),
      ) as Json[];
      const memberships = unwrap(
        await db.from("campaign_members").select("campaign_id, role").eq("user_id", userId),
      ) as { campaign_id: string; role: string }[];
      const extraIds = memberships
        .map((m) => m.campaign_id)
        .filter((id) => !owned.some((c) => c["id"] === id));
      const extra = extraIds.length
        ? ((unwrap(
            await db.from("campaigns").select("id, name, description, gm_id").in("id", extraIds),
          ) as Json[]) ?? [])
        : [];
      return [...owned, ...extra].map((row) => ({
        id: row["id"],
        name: row["name"],
        description: row["description"],
        role:
          row["gm_id"] === userId
            ? "gm"
            : (memberships.find((m) => m.campaign_id === row["id"])?.role ?? "player"),
      }));
    },
  },
  {
    name: "create_campaign",
    description: "Create a new campaign owned by this user.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const db = await admin();
      return unwrap(
        await db
          .from("campaigns")
          .insert({
            name: str(args, "name"),
            description: optString(args, "description") ?? null,
            gm_id: userId,
          })
          .select("id, name, description")
          .single(),
      );
    },
  },
  {
    name: "list_entry_types",
    description:
      "List the kinds of world entries (character, location, faction, item, session, event, …) and the fields each kind accepts in its `data` object.",
    inputSchema: {
      type: "object",
      properties: { kind: { type: "string" } },
      additionalProperties: false,
    },
    handler: async (args) => {
      const only = optString(args, "kind");
      return KINDS.filter((k) => !only || k.kind === only).map((k) => ({
        kind: k.kind,
        label: k.label,
        group: k.group,
        statuses: k.statuses,
        default_status: k.defaultStatus,
        fields: k.fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type,
          options: f.options,
          gm_only: f.gm ?? false,
        })),
      }));
    },
  },
  {
    name: "list_entries",
    description: "List world entries in a campaign, optionally filtered by kind or a text search.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        kind: { type: "string" },
        search: { type: "string" },
        limit: { type: "number" },
      },
      required: ["campaign_id"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const campaignId = str(args, "campaign_id");
      const { isGm } = await access(userId, campaignId);
      const db = await admin();
      let query = db
        .from("entities")
        .select("id, kind, name, summary, status, visibility, tags, data, gm_notes, updated_at")
        .eq("campaign_id", campaignId)
        .is("archived_at", null)
        .order("kind")
        .order("name")
        .limit(Math.min(Number(args["limit"]) || 200, 500));
      const kind = optString(args, "kind");
      if (kind) query = query.eq("kind", kind);
      const search = optString(args, "search");
      if (search) query = query.ilike("name", `%${search}%`);
      const rows = (unwrap(await query) as Json[]) ?? [];
      return rows
        .filter((row) => isGm || isPlayerVisible(row["visibility"] as string))
        .map((row) => publicEntity(row, isGm));
    },
  },
  {
    name: "get_entry",
    description: "Read one world entry in full.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const id = str(args, "id");
      const { campaign_id } = await entityCampaign(id);
      const { isGm } = await access(userId, campaign_id);
      const db = await admin();
      const row = unwrap(await db.from("entities").select("*").eq("id", id).single()) as Json;
      if (!isGm && !isPlayerVisible(row["visibility"] as string)) {
        throw new Error("Entry not found.");
      }
      return publicEntity(row, isGm);
    },
  },
  {
    name: "create_entry",
    description:
      "Create a world entry (NPC, location, faction, item, session, timeline event, …). Game master only. Use list_entry_types first to learn the fields a kind accepts.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        kind: { type: "string", enum: KIND_ENUM },
        name: { type: "string" },
        summary: { type: "string" },
        description: { type: "string" },
        gm_notes: { type: "string" },
        status: { type: "string" },
        visibility: { type: "string", enum: VISIBILITY_ENUM },
        tags: { type: "array", items: { type: "string" } },
        data: { type: "object", additionalProperties: true },
      },
      required: ["campaign_id", "kind", "name"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const campaignId = str(args, "campaign_id");
      await requireGm(userId, campaignId);
      const kind = str(args, "kind");
      const def = kindDef(kind);
      const db = await admin();
      return unwrap(
        await db
          .from("entities")
          .insert({
            campaign_id: campaignId,
            kind,
            name: str(args, "name"),
            summary: optString(args, "summary") ?? null,
            description: optString(args, "description") ?? null,
            gm_notes: optString(args, "gm_notes") ?? null,
            status: optString(args, "status") ?? def.defaultStatus,
            visibility: optString(args, "visibility") ?? "GM_ONLY",
            tags: Array.isArray(args["tags"]) ? (args["tags"] as string[]) : [],
            data: (args["data"] as Json) ?? {},
            created_by: userId,
          })
          .select("id, kind, name, status, visibility")
          .single(),
      );
    },
  },
  {
    name: "update_entry",
    description: "Change fields on an existing world entry. Game master only.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        summary: { type: "string" },
        description: { type: "string" },
        gm_notes: { type: "string" },
        status: { type: "string" },
        visibility: { type: "string", enum: VISIBILITY_ENUM },
        tags: { type: "array", items: { type: "string" } },
        data: { type: "object", additionalProperties: true },
      },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const id = str(args, "id");
      const { campaign_id } = await entityCampaign(id);
      await requireGm(userId, campaign_id);
      const patch: Json = {};
      for (const key of [
        "name",
        "summary",
        "description",
        "gm_notes",
        "status",
        "visibility",
      ] as const) {
        const value = optString(args, key);
        if (value !== undefined) patch[key] = value;
      }
      if (Array.isArray(args["tags"])) patch["tags"] = args["tags"];
      if (args["data"] && typeof args["data"] === "object") patch["data"] = args["data"];
      if (Object.keys(patch).length === 0) throw new Error("Nothing to update.");
      const db = await admin();
      return unwrap(
        await db
          .from("entities")
          .update(patch)
          .eq("id", id)
          .select("id, kind, name, status, visibility")
          .single(),
      );
    },
  },
  {
    name: "delete_entry",
    description: "Delete a world entry. Game master only.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const id = str(args, "id");
      const { campaign_id } = await entityCampaign(id);
      await requireGm(userId, campaign_id);
      const db = await admin();
      unwrap(await db.from("entities").delete().eq("id", id));
      return { deleted: id };
    },
  },
  {
    name: "list_relationships",
    description: "List the links between world entries in a campaign.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      required: ["campaign_id"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const campaignId = str(args, "campaign_id");
      const { isGm } = await access(userId, campaignId);
      const db = await admin();
      const rows = (unwrap(
        await db
          .from("entity_relationships")
          .select("id, source_id, target_id, rel_type, description, visibility, is_current")
          .eq("campaign_id", campaignId),
      ) as Json[]) ?? [];
      return rows.filter((row) => isGm || isPlayerVisible(row["visibility"] as string));
    },
  },
  {
    name: "create_relationship",
    description: "Link two world entries. Game master only.",
    inputSchema: {
      type: "object",
      properties: {
        campaign_id: { type: "string" },
        source_id: { type: "string" },
        target_id: { type: "string" },
        rel_type: { type: "string" },
        description: { type: "string" },
        visibility: { type: "string", enum: VISIBILITY_ENUM },
      },
      required: ["campaign_id", "source_id", "target_id", "rel_type"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const campaignId = str(args, "campaign_id");
      await requireGm(userId, campaignId);
      const db = await admin();
      return unwrap(
        await db
          .from("entity_relationships")
          .insert({
            campaign_id: campaignId,
            source_id: str(args, "source_id"),
            target_id: str(args, "target_id"),
            rel_type: str(args, "rel_type"),
            description: optString(args, "description") ?? null,
            visibility: optString(args, "visibility") ?? "GM_ONLY",
            created_by: userId,
          })
          .select("id, source_id, target_id, rel_type")
          .single(),
      );
    },
  },
  {
    name: "list_characters",
    description: "List characters this user owns, or the characters in a campaign they run.",
    inputSchema: {
      type: "object",
      properties: { campaign_id: { type: "string" } },
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const db = await admin();
      const campaignId = optString(args, "campaign_id");
      if (campaignId) {
        const { isGm } = await access(userId, campaignId);
        let query = db
          .from("characters")
          .select("id, name, owner_id, is_npc, point_budget, campaign_id")
          .eq("campaign_id", campaignId);
        if (!isGm) query = query.eq("owner_id", userId);
        return unwrap(await query);
      }
      return unwrap(
        await db
          .from("characters")
          .select("id, name, owner_id, is_npc, point_budget, campaign_id")
          .eq("owner_id", userId),
      );
    },
  },
  {
    name: "get_character",
    description: "Read a character sheet with all of its entries.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const id = str(args, "id");
      const db = await admin();
      const character = unwrap(
        await db.from("characters").select("*").eq("id", id).maybeSingle(),
      ) as Json | null;
      if (!character) throw new Error("Character not found.");
      if (character["owner_id"] !== userId) {
        const campaignId = character["campaign_id"] as string | null;
        if (!campaignId) throw new Error("Character not found.");
        await requireGm(userId, campaignId);
      }
      const entries = unwrap(
        await db.from("character_entries").select("*").eq("character_id", id).order("sort_order"),
      );
      return { character, entries };
    },
  },
  {
    name: "create_character",
    description: "Create a character or NPC sheet owned by this user.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        campaign_id: { type: "string" },
        is_npc: { type: "boolean" },
        concept: { type: "string" },
        point_budget: { type: "number" },
        st: { type: "number" },
        dx: { type: "number" },
        iq: { type: "number" },
        ht: { type: "number" },
        notes: { type: "string" },
      },
      required: ["name"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const campaignId = optString(args, "campaign_id");
      if (campaignId) await access(userId, campaignId);
      const db = await admin();
      const row: Json = {
        name: str(args, "name"),
        owner_id: userId,
        campaign_id: campaignId ?? null,
        is_npc: args["is_npc"] === true,
        concept: optString(args, "concept") ?? null,
        notes: optString(args, "notes") ?? null,
      };
      for (const key of ["point_budget", "st", "dx", "iq", "ht"] as const) {
        if (typeof args[key] === "number") row[key] = args[key];
      }
      return unwrap(
        await db.from("characters").insert(row).select("id, name, campaign_id, is_npc").single(),
      );
    },
  },
  {
    name: "add_character_entry",
    description:
      "Add a line to a character sheet: an advantage, disadvantage, skill, technique, equipment item, weapon or note.",
    inputSchema: {
      type: "object",
      properties: {
        character_id: { type: "string" },
        kind: { type: "string" },
        name: { type: "string" },
        category: { type: "string" },
        points: { type: "number" },
        levels: { type: "number" },
        notes: { type: "string" },
        data: { type: "object", additionalProperties: true },
      },
      required: ["character_id", "kind", "name"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const characterId = str(args, "character_id");
      const db = await admin();
      const character = unwrap(
        await db
          .from("characters")
          .select("id, owner_id, campaign_id")
          .eq("id", characterId)
          .maybeSingle(),
      ) as Json | null;
      if (!character) throw new Error("Character not found.");
      if (character["owner_id"] !== userId) {
        const campaignId = character["campaign_id"] as string | null;
        if (!campaignId) throw new Error("Character not found.");
        await requireGm(userId, campaignId);
      }
      return unwrap(
        await db
          .from("character_entries")
          .insert({
            character_id: characterId,
            kind: str(args, "kind"),
            name: str(args, "name"),
            category: optString(args, "category") ?? null,
            points: typeof args["points"] === "number" ? args["points"] : 0,
            levels: typeof args["levels"] === "number" ? args["levels"] : 0,
            notes: optString(args, "notes") ?? null,
            data: (args["data"] as Json) ?? {},
          })
          .select("id, kind, name, points, levels")
          .single(),
      );
    },
  },
  {
    name: "delete_character_entry",
    description: "Remove a line from a character sheet.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
    handler: async (args, userId) => {
      const id = str(args, "id");
      const db = await admin();
      const entry = unwrap(
        await db.from("character_entries").select("id, character_id").eq("id", id).maybeSingle(),
      ) as Json | null;
      if (!entry) throw new Error("Entry not found.");
      const character = unwrap(
        await db
          .from("characters")
          .select("owner_id, campaign_id")
          .eq("id", entry["character_id"])
          .single(),
      ) as Json;
      if (character["owner_id"] !== userId) {
        const campaignId = character["campaign_id"] as string | null;
        if (!campaignId) throw new Error("Entry not found.");
        await requireGm(userId, campaignId);
      }
      unwrap(await db.from("character_entries").delete().eq("id", id));
      return { deleted: id };
    },
  },
];

export const TOOL_MAP = new Map(TOOLS.map((tool) => [tool.name, tool]));
