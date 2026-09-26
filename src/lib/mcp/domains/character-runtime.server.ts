/**
 * Play-time character state: current HP/FP/conditions and weapon ammo.
 *
 * This is a convenience surface for active play. HP, FP and conditions can
 * also be set through the `characters` domain's `update_character` action —
 * both paths write the same columns under the same authorization rules.
 */

import { z } from "zod/v4";
import {
  actionRouter,
  buildPatch,
  characterView,
  detailReply,
  domainOutput,
  fail,
  limitField,
  listReply,
  loadCharacter,
  requireCharacterWrite,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, Structured, ToolRegistrar } from "@/lib/mcp/kit.server";
import type { Database } from "@/integrations/supabase/types";
import { speakAsCharacter, TTS_MAX_CHARS } from "@/lib/tts.server";
import type { CharacterEntry, CharacterRecord } from "@/rules";
import { rulesetFromSettings } from "@/rules/campaign-ruleset";
import { validateCharacter } from "@/lib/pack-validation";
import { readPackLink, type PackItemLike, type PackLink } from "@/lib/pack-link";
import {
  deriveStatuses,
  loadCampaignSettings,
  resolveLinkedItems,
  type EntryRowLike,
} from "@/lib/pack-link-service";

type EntryRow = Database["public"]["Tables"]["character_entries"]["Row"];
type CharacterRow = Database["public"]["Tables"]["characters"]["Row"];

/** Local copies of the api.ts mappers: that module pulls in the browser client. */
function toRulesEntry(row: EntryRow): CharacterEntry {
  return {
    id: row.id,
    character_id: row.character_id,
    kind: row.kind as CharacterEntry["kind"],
    name: row.name,
    category: row.category,
    points: row.points,
    levels: row.levels,
    data: (row.data ?? {}) as CharacterEntry["data"],
    notes: row.notes,
    source: (row.source ?? {}) as CharacterEntry["source"],
    sort_order: row.sort_order,
  };
}

function toCharacterRecord(row: CharacterRow): CharacterRecord {
  return {
    id: row.id,
    name: row.name,
    player_name: row.player_name,
    concept: row.concept,
    point_budget: row.point_budget,
    tech_level: row.tech_level,
    st: row.st,
    dx: row.dx,
    iq: row.iq,
    ht: row.ht,
    hp_delta: row.hp_delta,
    will_delta: row.will_delta,
    per_delta: row.per_delta,
    fp_delta: row.fp_delta,
    speed_delta: Number(row.speed_delta),
    move_delta: row.move_delta,
    current_hp: row.current_hp,
    current_fp: row.current_fp,
    conditions: row.conditions ?? [],
    wealth: row.wealth,
    status: row.status,
    notes: row.notes,
    is_npc: row.is_npc,
    approved: row.approved,
  };
}

/** Matches the `mode:<index>` shape produced by attackModeKey() in weapon-state.ts. */
const MODE_KEY_PATTERN = /^mode:\d+$/;
const modeKey = z
  .string()
  .regex(MODE_KEY_PATTERN, { error: 'mode_key must look like "mode:0", "mode:1", etc.' });

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("get"), character_id: uuid })
    .describe("Read a sheet's current HP, FP, conditions, and weapon ammo state."),
  z
    .object({
      action: z.literal("update_vitals"),
      character_id: uuid,
      current_hp: z.number().int().nullable().optional(),
      current_fp: z.number().int().nullable().optional(),
      conditions: z.array(z.string().min(1).max(50)).max(50).optional(),
    })
    .describe(
      "Set current HP, current FP, and/or the conditions list. Owner or campaign GM only. " +
        "Changes data. (Equivalent fields are also editable via update_character.)",
    ),
  z
    .object({ action: z.literal("list_ammo"), character_id: uuid })
    .describe("Read the weapon ammo state rows for a sheet."),
  z
    .object({
      action: z.literal("set_ammo"),
      character_entry_id: uuid,
      mode_key: modeKey,
      current_shots: z.number().int().min(0).max(100000),
    })
    .describe(
      "Set an attack mode's current shots to an exact value via the set_weapon_ammo RPC. Owner " +
        "or campaign GM only; the database refuses negative values. Changes data.",
    ),
  z
    .object({
      action: z.literal("adjust_ammo"),
      character_entry_id: uuid,
      mode_key: modeKey,
      delta: z.number().int().min(-100000).max(100000),
    })
    .describe(
      "Atomically add (or, with a negative delta, subtract) shots for an attack mode via the " +
        "adjust_weapon_ammo RPC, clamped at zero. Owner or campaign GM only. Changes data.",
    ),
  z
    .object({
      action: z.literal("speak"),
      character_id: uuid,
      text: z.string().min(1).max(TTS_MAX_CHARS),
    })
    .describe(
      "Speak a line in the character's saved voice using the CALLER's own ElevenLabs account " +
        "(their credits). Returns base64 MP3 audio. Requires a voice chosen on the sheet and the " +
        "caller's key saved in their profile. Does not change data.",
    ),
  z
    .object({ action: z.literal("validate"), character_id: uuid })
    .describe(
      "Check a sheet without changing anything: point totals against the sheet budget and any " +
        "campaign limits, calculated skill levels against any level written on an entry, and how " +
        "each entry compares with its content-pack definition (official, modified, custom or out " +
        "of date). Campaign house rules change calculated numbers only and never change whether " +
        "an entry counts as official.",
    ),
]);

async function listAmmoRows(ctx: McpToolContext, characterId: string): Promise<Structured[]> {
  const { data, error } = await ctx.supabase
    .from("character_weapon_state")
    .select("*")
    .eq("character_id", characterId);
  if (error) fail("Listing weapon ammo", error);
  return (data ?? []) as Structured[];
}

export function registerCharacterRuntime(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "character_runtime",
    {
      title: "Character play state",
      description:
        "Convenience actions for active play: HP/FP/conditions and weapon ammo. Actions: get " +
        "(read HP, FP, conditions and ammo for a sheet), update_vitals (set HP/FP/conditions, " +
        "owner or campaign GM only, changes data — the same fields can also be set through " +
        "update_character), list_ammo (read a sheet's weapon ammo rows), set_ammo (set an attack " +
        "mode's shots to an exact value, owner or campaign GM only, changes data), adjust_ammo " +
        "(add or subtract shots atomically, clamped at zero, owner or campaign GM only, changes " +
        "data), speak (voice a line in the character's saved voice with the caller's own " +
        "ElevenLabs account; returns base64 MP3; does not change data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      speak: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- table newer than generated types
        const audio = await speakAsCharacter(ctx.supabase as any, ctx.userId, i.character_id, i.text);
        return detailReply(`Spoke a line as "${access.row.name}".`, {
          character_id: i.character_id,
          ...audio,
        });
      },

      get: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        const ammo = await listAmmoRows(ctx, i.character_id);
        const view = characterView(access);
        return detailReply(`Play state for "${access.row.name}".`, {
          character_id: i.character_id,
          current_hp: view["current_hp"],
          current_fp: view["current_fp"],
          conditions: view["conditions"],
          ammo,
        });
      },

      update_vitals: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        requireCharacterWrite(access);
        const patch = buildPatch({
          current_hp: i.current_hp,
          current_fp: i.current_fp,
          conditions: i.conditions,
        });
        if (Object.keys(patch).length === 0) {
          throw new Error("Nothing to update — provide current_hp, current_fp, or conditions.");
        }
        const { data, error } = await ctx.supabase
          .from("characters")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- patch is a validated partial subset of columns
          .update(patch as any)
          .eq("id", i.character_id)
          .select("*")
          .single();
        if (error) fail("Updating vitals", error);
        return detailReply(`Updated play state for "${access.row.name}".`, {
          character_id: i.character_id,
          current_hp: data.current_hp,
          current_fp: data.current_fp,
          conditions: data.conditions,
        });
      },

      list_ammo: async (i) => {
        await loadCharacter(ctx, i.character_id); // authorizes read via RLS-backed lookup
        const items = await listAmmoRows(ctx, i.character_id);
        return listReply("weapon ammo rows", items, items.length);
      },

      set_ammo: async (i) => {
        const { data, error } = await ctx.supabase.rpc("set_weapon_ammo", {
          _entry: i.character_entry_id,
          _mode: i.mode_key,
          _shots: i.current_shots,
        });
        if (error) fail("Setting weapon ammo", error);
        return detailReply(`Set ${i.mode_key} to ${i.current_shots} shot(s).`, data as Structured);
      },

      adjust_ammo: async (i) => {
        const { data, error } = await ctx.supabase.rpc("adjust_weapon_ammo", {
          _entry: i.character_entry_id,
          _mode: i.mode_key,
          _delta: i.delta,
        });
        if (error) fail("Adjusting weapon ammo", error);
        return detailReply(
          `Adjusted ${i.mode_key} by ${i.delta >= 0 ? "+" : ""}${i.delta}.`,
          data as Structured,
        );
      },

      validate: async (i) => {
        const access = await loadCharacter(ctx, i.character_id);
        const { data: rows, error } = await ctx.supabase
          .from("character_entries")
          .select("*")
          .eq("character_id", i.character_id)
          .order("sort_order");
        if (error) fail("Reading character entries", error);
        const entryRows = (rows ?? []) as EntryRow[];
        const entries = entryRows.map(toRulesEntry);

        const settings = await loadCampaignSettings(ctx.supabase, access.row.campaign_id);
        const statuses = await deriveStatuses(
          ctx.supabase,
          entryRows as unknown as EntryRowLike[],
          settings,
          ctx.userId,
        );
        const links = entryRows
          .map((row) => readPackLink(row.source))
          .filter((link): link is PackLink => link !== null);
        const resolved = await resolveLinkedItems(ctx.supabase, links, ctx.userId);
        const packItems = new Map<string, PackItemLike>();
        for (const row of entryRows) {
          const link = readPackLink(row.source);
          const item = link ? resolved.byId.get(link.pack_entry_id) : null;
          if (item) packItems.set(row.id, item);
        }

        const report = validateCharacter({
          character: toCharacterRecord(access.row as CharacterRow),
          entries,
          statuses,
          packItems,
          // The ordinary campaign limits and the house-rule engine overrides are
          // two different things and are reported separately.
          campaignSettings: settings,
          ruleset: rulesetFromSettings(settings),
        });
        return detailReply(
          `Checked "${access.row.name}": ${report.findings.length} finding(s).`,
          report as unknown as Structured,
        );
      },
    }),
  );
}
