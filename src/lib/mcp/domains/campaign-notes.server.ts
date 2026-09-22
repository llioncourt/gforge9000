/**
 * Campaign notes: freeform GM/player text (handouts, session prep, rules,
 * plain notes) scoped to one campaign.
 *
 * Visibility mirrors the `notes_select` policy on `campaign_notes`: the GM
 * sees everything, a member sees every note except another author's
 * `gm_only` ones. Writes mirror `notes_insert` / `notes_update` /
 * `notes_delete`: any member may create a note they author, and only the
 * note's own author or the campaign GM may edit or delete it — so those two
 * checks are re-asserted here on top of RLS rather than relied on alone.
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
  isCampaignMember,
  limitField,
  listReply,
  loadCampaign,
  requirePatch,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, ToolRegistrar } from "@/lib/mcp/kit.server";

/** Mirrors the app's note kinds (see `rg -n "campaign_notes" src/`). */
const NOTE_KINDS = ["note", "handout", "session", "session-prep", "rule"] as const;
const noteKind = z.enum(NOTE_KINDS);

const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      campaign_id: uuid,
      kind: noteKind.optional(),
      limit: limitField,
    })
    .describe("List notes in a campaign, optionally filtered by kind."),
  z
    .object({ action: z.literal("get"), note_id: uuid })
    .describe("Get one note by id."),
  z
    .object({
      action: z.literal("create"),
      campaign_id: uuid,
      kind: noteKind,
      title: z.string().min(1).max(200),
      body: z.string().max(50000).optional(),
      gm_only: z.boolean().optional(),
    })
    .describe("Create a note; you become its author."),
  z
    .object({
      action: z.literal("update"),
      note_id: uuid,
      kind: noteKind.optional(),
      title: z.string().min(1).max(200).optional(),
      body: z.string().max(50000).nullable().optional(),
      gm_only: z.boolean().optional(),
    })
    .describe("Update a note's fields. Only the author or the campaign GM may do this."),
  z
    .object({ action: z.literal("delete"), note_id: uuid })
    .describe("Permanently delete a note. Only the author or the campaign GM may do this."),
]);

async function loadNote(ctx: McpToolContext, noteId: string) {
  const { data, error } = await ctx.supabase
    .from("campaign_notes")
    .select("*")
    .eq("id", noteId)
    .maybeSingle();
  if (error) fail("Note lookup", error);
  if (!data) throw new Error("Note not found, or you do not have access to it.");
  return data;
}

export function registerCampaignNotes(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "campaign_notes",
    {
      title: "Campaign notes",
      description:
        "Manage campaign notes (kinds: note, handout, session, session-prep, rule). " +
        "Actions: list (read notes visible to you), get (read one note), " +
        "create (add a note you author — changes data), " +
        "update (edit a note's kind/title/body/gm_only, author or GM only — changes data), " +
        "delete (permanently remove a note, author or GM only — deletes data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      list: async (i) => {
        await loadCampaign(ctx, i.campaign_id);
        let query = ctx.supabase.from("campaign_notes").select("*").eq("campaign_id", i.campaign_id);
        if (i.kind) query = query.eq("kind", i.kind);
        const { data, error } = await query
          .order("created_at", { ascending: false })
          .limit(i.limit ?? 50);
        if (error) fail("Listing notes", error);
        const total = await countRows(() => {
          let countQuery = ctx.supabase
            .from("campaign_notes")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", i.campaign_id);
          if (i.kind) countQuery = countQuery.eq("kind", i.kind);
          return countQuery;
        }, data?.length ?? 0);
        return listReply("notes", data ?? [], total);
      },
      get: async (i) => {
        const note = await loadNote(ctx, i.note_id);
        return detailReply(`Note "${note.title}".`, note);
      },
      create: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        const member = campaign.isGm || (await isCampaignMember(ctx, i.campaign_id));
        if (!member) {
          throw new Error(`Only members of "${campaign.name}" can add notes.`);
        }
        const { data, error } = await ctx.supabase
          .from("campaign_notes")
          .insert({
            campaign_id: i.campaign_id,
            kind: i.kind,
            title: i.title,
            body: i.body ?? null,
            gm_only: i.gm_only ?? false,
            author_id: ctx.userId,
          })
          .select("*")
          .single();
        if (error) fail("Creating note", error);
        return detailReply(`Created note "${data.title}".`, data);
      },
      update: async (i) => {
        const existing = await loadNote(ctx, i.note_id);
        const campaign = await loadCampaign(ctx, existing.campaign_id);
        if (existing.author_id !== ctx.userId && !campaign.isGm) {
          throw new Error(
            `Only this note's author or the Game Master of "${campaign.name}" can edit it.`,
          );
        }
        const patch = buildPatch({
          kind: i.kind,
          title: i.title,
          body: i.body,
          gm_only: i.gm_only,
        });
        requirePatch(patch);
        const { data, error } = await ctx.supabase
          .from("campaign_notes")
          .update(patch)
          .eq("id", i.note_id)
          .select("*")
          .single();
        if (error) fail("Updating note", error);
        return detailReply(`Updated note "${data.title}".`, data);
      },
      delete: async (i) => {
        const existing = await loadNote(ctx, i.note_id);
        const campaign = await loadCampaign(ctx, existing.campaign_id);
        if (existing.author_id !== ctx.userId && !campaign.isGm) {
          throw new Error(
            `Only this note's author or the Game Master of "${campaign.name}" can delete it.`,
          );
        }
        const { error } = await ctx.supabase.from("campaign_notes").delete().eq("id", i.note_id);
        if (error) fail("Deleting note", error);
        return deleteReply(`Deleted note "${existing.title}".`, i.note_id);
      },
    }),
  );
}
