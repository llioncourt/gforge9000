/**
 * Session chronicles: the GM's authoritative record of what actually
 * happened in a session (transcript, reconstructed events, reviewable
 * findings), layered on top of the existing prep/recap notes.
 *
 * Field sets and defaults mirror `src/lib/adaptation/chronicle-api.ts`
 * exactly. Both tables are GM-only end to end: `session_chronicles_all` and
 * `session_chronicle_items_all` gate every action on
 * `is_campaign_gm_member`, and chronicle writes additionally require
 * `created_by = auth.uid()`. Those checks are re-asserted here rather than
 * relied on through RLS alone, and visibility is never widened past what the
 * app already allows.
 */

import { z } from "zod/v4";
import {
  CREATE,
  DESTROY,
  MODIFY,
  READ,
  actionRouter,
  buildPatch,
  countRows,
  deleteReply,
  detailReply,
  domainOutput,
  fail,
  jsonRecord,
  limitField,
  listReply,
  loadCampaign,
  requireGmFor,
  requirePatch,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, ToolRegistrar } from "@/lib/mcp/kit.server";
import type { Json } from "@/integrations/supabase/types";
import { hashValue } from "@/lib/adaptation/hash";
import { CHRONICLE_ITEM_TYPES, PROVENANCE_TYPES } from "@/lib/adaptation/types";

const CHRONICLE_STATUSES = ["draft", "analyzed", "approved"] as const;
const REVIEW_STATUSES = ["confirmed", "needs_review", "rejected"] as const;

const materialField = z.object({
  title: z.string().min(1).max(200),
  bucket: z.string().min(1).max(120),
  path: z.string().min(1).max(400),
  media_type: z.string().max(100).optional(),
});

/** Fields the app itself writes on a chronicle, shared by create and update. */
const chronicleWritable = {
  title: z.string().min(1).max(200).optional(),
  session_no: z.number().int().min(0).max(100000).nullable().optional(),
  played_on: z.string().max(40).nullable().optional(),
  in_world_date: jsonRecord.nullable().optional(),
  status: z.enum(CHRONICLE_STATUSES).optional(),
  prep_note_id: uuid.nullable().optional(),
  recap_note_id: uuid.nullable().optional(),
  transcript: z.string().max(200000).optional(),
  raw_notes: z.string().max(200000).optional(),
  approved_recap: z.string().max(200000).optional(),
  materials: z.array(materialField).max(200).optional(),
} as const;

/** Fields the app itself writes on a chronicle item, shared by add and update. */
const itemWritable = {
  item_type: z.enum(CHRONICLE_ITEM_TYPES).optional(),
  summary: z.string().min(1).max(2000).optional(),
  detail: z.string().max(20000).optional(),
  subject_entity_id: uuid.nullable().optional(),
  character_id: uuid.nullable().optional(),
  provenance_type: z.enum(PROVENANCE_TYPES).optional(),
  source_refs: z.array(jsonRecord).max(200).optional(),
  review_status: z.enum(REVIEW_STATUSES).optional(),
  gm_only: z.boolean().optional(),
  data: jsonRecord.optional(),
} as const;

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("list"), campaign_id: uuid, limit: limitField })
    .describe("List session chronicles in a campaign (GM only)."),
  z.object({ action: z.literal("get"), chronicle_id: uuid }).describe("Get one chronicle."),
  z
    .object({
      action: z.literal("create"),
      campaign_id: uuid,
      title: z.string().min(1).max(200),
      session_no: chronicleWritable.session_no,
      played_on: chronicleWritable.played_on,
      in_world_date: chronicleWritable.in_world_date,
      status: chronicleWritable.status,
      prep_note_id: chronicleWritable.prep_note_id,
      recap_note_id: chronicleWritable.recap_note_id,
      transcript: chronicleWritable.transcript,
      raw_notes: chronicleWritable.raw_notes,
      approved_recap: chronicleWritable.approved_recap,
      materials: chronicleWritable.materials,
    })
    .describe("Create a session chronicle; you become its author (GM only)."),
  z
    .object({ action: z.literal("update"), chronicle_id: uuid, ...chronicleWritable })
    .describe("Update a chronicle's fields (GM only)."),
  z
    .object({ action: z.literal("delete"), chronicle_id: uuid })
    .describe("Permanently delete a chronicle and its items (GM only)."),
  z
    .object({ action: z.literal("list_items"), chronicle_id: uuid, limit: limitField })
    .describe("List a chronicle's items, ordered by sequence."),
  z
    .object({
      action: z.literal("add_item"),
      chronicle_id: uuid,
      item_type: z.enum(CHRONICLE_ITEM_TYPES),
      summary: z.string().min(1).max(2000),
      detail: itemWritable.detail,
      subject_entity_id: itemWritable.subject_entity_id,
      character_id: itemWritable.character_id,
      provenance_type: itemWritable.provenance_type,
      source_refs: itemWritable.source_refs,
      review_status: itemWritable.review_status,
      gm_only: itemWritable.gm_only,
      data: itemWritable.data,
    })
    .describe(
      "Add a chronicle item; sequence_no defaults to one past the chronicle's current highest (GM only).",
    ),
  z
    .object({ action: z.literal("update_item"), item_id: uuid, ...itemWritable })
    .describe("Update a chronicle item's fields (GM only)."),
  z
    .object({ action: z.literal("delete_item"), item_id: uuid })
    .describe("Permanently delete a chronicle item (GM only)."),
]);

type Input = z.infer<typeof input>;

async function loadChronicle(ctx: McpToolContext, chronicleId: string) {
  const { data, error } = await ctx.supabase
    .from("session_chronicles")
    .select("*")
    .eq("id", chronicleId)
    .maybeSingle();
  if (error) fail("Chronicle lookup", error);
  if (!data) throw new Error("Chronicle not found, or you do not have access to it.");
  return data;
}

async function loadItem(ctx: McpToolContext, itemId: string) {
  const { data, error } = await ctx.supabase
    .from("session_chronicle_items")
    .select("*")
    .eq("id", itemId)
    .maybeSingle();
  if (error) fail("Chronicle item lookup", error);
  if (!data) throw new Error("Chronicle item not found, or you do not have access to it.");
  return data;
}

export function registerSessionChronicles(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "session_chronicles",
    {
      title: "Session chronicles",
      description:
        "Manage GM session chronicles and their items — the authoritative record of what " +
        "actually happened, kept separate from prep/recap notes. GM only, on every action. " +
        "Actions: list, get, list_items (read), " +
        "create (add a chronicle you author — changes data), " +
        "update (edit a chronicle's fields — changes data), " +
        "delete (permanently remove a chronicle and its items — deletes data), " +
        "add_item (append an item — changes data), " +
        "update_item (edit an item's fields — changes data), " +
        "delete_item (permanently remove an item — deletes data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<Input>({
      list: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "view session chronicles");
        const { data, error } = await ctx.supabase
          .from("session_chronicles")
          .select("*")
          .eq("campaign_id", i.campaign_id)
          .order("session_no", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: true })
          .limit(i.limit ?? 50);
        if (error) fail("Listing chronicles", error);
        const total = await countRows(
          () =>
            ctx.supabase
              .from("session_chronicles")
              .select("id", { count: "exact", head: true })
              .eq("campaign_id", i.campaign_id),
          data?.length ?? 0,
        );
        return listReply("session chronicles", data ?? [], total);
      },
      get: async (i) => {
        const chronicle = await loadChronicle(ctx, i.chronicle_id);
        return detailReply(`Chronicle "${chronicle.title}".`, chronicle);
      },
      create: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "create session chronicles");
        const { action: _action, campaign_id: _cid, title, in_world_date, materials, ...rest } = i;
        const patch = buildPatch({
          ...rest,
          in_world_date: in_world_date as Json | null | undefined,
          materials: materials as Json | undefined,
        });
        const { data, error } = await ctx.supabase
          .from("session_chronicles")
          .insert({
            campaign_id: i.campaign_id,
            title,
            created_by: ctx.userId,
            ...patch,
          })
          .select("*")
          .single();
        if (error) fail("Creating chronicle", error);
        return detailReply(`Created chronicle "${data.title}".`, data);
      },
      update: async (i) => {
        const existing = await loadChronicle(ctx, i.chronicle_id);
        const campaign = await loadCampaign(ctx, existing.campaign_id);
        requireGmFor(campaign, "update session chronicles");
        const { action: _action, chronicle_id: _id, in_world_date, materials, ...rest } = i;
        const patch = buildPatch({
          ...rest,
          in_world_date: in_world_date as Json | null | undefined,
          materials: materials as Json | undefined,
        });
        requirePatch(patch);
        const update: Record<string, unknown> = { ...patch };
        if ("transcript" in update || "raw_notes" in update) {
          const transcript = (update["transcript"] as string | undefined) ?? existing.transcript;
          const rawNotes = (update["raw_notes"] as string | undefined) ?? existing.raw_notes;
          update["content_hash"] = hashValue([transcript, rawNotes]);
        }
        const { data, error } = await ctx.supabase
          .from("session_chronicles")
          .update(patch)
          .eq("id", i.chronicle_id)
          .select("*")
          .single();
        if (error) fail("Updating chronicle", error);
        return detailReply(`Updated chronicle "${data.title}".`, data);
      },
      delete: async (i) => {
        const existing = await loadChronicle(ctx, i.chronicle_id);
        const campaign = await loadCampaign(ctx, existing.campaign_id);
        requireGmFor(campaign, "delete session chronicles");
        const { error } = await ctx.supabase
          .from("session_chronicles")
          .delete()
          .eq("id", i.chronicle_id);
        if (error) fail("Deleting chronicle", error);
        return deleteReply(`Deleted chronicle "${existing.title}".`, i.chronicle_id);
      },
      list_items: async (i) => {
        const chronicle = await loadChronicle(ctx, i.chronicle_id);
        const campaign = await loadCampaign(ctx, chronicle.campaign_id);
        requireGmFor(campaign, "view session chronicle items");
        const { data, error } = await ctx.supabase
          .from("session_chronicle_items")
          .select("*")
          .eq("chronicle_id", i.chronicle_id)
          .order("item_type", { ascending: true })
          .order("sequence_no", { ascending: true })
          .limit(i.limit ?? 50);
        if (error) fail("Listing chronicle items", error);
        const total = await countRows(
          () =>
            ctx.supabase
              .from("session_chronicle_items")
              .select("id", { count: "exact", head: true })
              .eq("chronicle_id", i.chronicle_id),
          data?.length ?? 0,
        );
        return listReply("chronicle items", data ?? [], total);
      },
      add_item: async (i) => {
        const chronicle = await loadChronicle(ctx, i.chronicle_id);
        const campaign = await loadCampaign(ctx, chronicle.campaign_id);
        requireGmFor(campaign, "add session chronicle items");
        const { data: maxRow, error: maxError } = await ctx.supabase
          .from("session_chronicle_items")
          .select("sequence_no")
          .eq("chronicle_id", i.chronicle_id)
          .order("sequence_no", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (maxError) fail("Reading current sequence", maxError);
        const nextSequence = (maxRow?.sequence_no ?? -1) + 1;
        const {
          action: _action,
          chronicle_id: _cid,
          item_type,
          summary,
          source_refs,
          data,
          ...rest
        } = i;
        const patch = buildPatch({
          ...rest,
          source_refs: source_refs as Json | undefined,
          data: data as Json | undefined,
        });
        const { data: created, error } = await ctx.supabase
          .from("session_chronicle_items")
          .insert({
            chronicle_id: i.chronicle_id,
            campaign_id: chronicle.campaign_id,
            item_type,
            summary,
            sequence_no: nextSequence,
            ...patch,
          })
          .select("*")
          .single();
        if (error) fail("Adding chronicle item", error);
        return detailReply(`Added item "${created.summary}".`, created);
      },
      update_item: async (i) => {
        const existing = await loadItem(ctx, i.item_id);
        const campaign = await loadCampaign(ctx, existing.campaign_id);
        requireGmFor(campaign, "update session chronicle items");
        const { action: _action, item_id: _id, source_refs, data: itemData, ...rest } = i;
        const patch = buildPatch({
          ...rest,
          source_refs: source_refs as Json | undefined,
          data: itemData as Json | undefined,
        });
        requirePatch(patch);
        const { data, error } = await ctx.supabase
          .from("session_chronicle_items")
          .update(patch)
          .eq("id", i.item_id)
          .select("*")
          .single();
        if (error) fail("Updating chronicle item", error);
        return detailReply(`Updated item "${data.summary}".`, data);
      },
      delete_item: async (i) => {
        const existing = await loadItem(ctx, i.item_id);
        const campaign = await loadCampaign(ctx, existing.campaign_id);
        requireGmFor(campaign, "delete session chronicle items");
        const { error } = await ctx.supabase
          .from("session_chronicle_items")
          .delete()
          .eq("id", i.item_id);
        if (error) fail("Deleting chronicle item", error);
        return deleteReply(`Deleted item "${existing.summary}".`, i.item_id);
      },
    }),
  );
}
