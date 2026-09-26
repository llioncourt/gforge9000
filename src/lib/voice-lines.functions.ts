import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Db } from "./tts.server";
import {
  createLine,
  deleteLine,
  lineAudioUrl,
  listLines,
  reorderLines,
  speakLine,
  updateLine,
} from "./voice-lines.server";

const id = z.string().uuid();
const text = z.string().trim().min(1).max(2500);
const label = z.string().max(120).nullable().optional();
const db = (c: { supabase: unknown }) => c.supabase as Db;

export const listVoiceLines = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ characterId: id }).parse(d))
  .handler(async ({ data, context }) => {
    const d = db(context);
    const { data: ch } = await d.from("characters").select("owner_id, campaign_id").eq("id", data.characterId).maybeSingle();
    let canEdit = ch?.owner_id === context.userId;
    if (!canEdit && ch?.campaign_id) {
      const { data: c } = await d.from("campaigns").select("gm_id").eq("id", ch.campaign_id).maybeSingle();
      canEdit = c?.gm_id === context.userId;
    }
    return { canEdit, lines: await listLines(d, data.characterId) };
  });

export const createVoiceLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ characterId: id, text, label, generate: z.boolean() }).parse(d))
  .handler(async ({ data, context }) =>
    createLine(db(context), context.userId, {
      character_id: data.characterId,
      text: data.text,
      label: data.label,
      generate_audio: data.generate,
    }),
  );

export const updateVoiceLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ lineId: id, text: text.optional(), label, visible: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) =>
    updateLine(db(context), {
      line_id: data.lineId,
      text: data.text,
      label: data.label,
      visible_to_players: data.visible,
    }),
  );

export const deleteVoiceLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lineId: id }).parse(d))
  .handler(async ({ data, context }) => {
    await deleteLine(db(context), data.lineId);
    return { ok: true };
  });

export const reorderVoiceLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ characterId: id, orderedIds: z.array(id).max(500) }).parse(d))
  .handler(async ({ data, context }) => reorderLines(db(context), data.characterId, data.orderedIds));

export const speakVoiceLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lineId: id, regenerate: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const r = await speakLine(db(context), context.userId, data.lineId, data.regenerate);
    return { audio_url: r.audio_url, cached: r.cached };
  });

export const voiceLineUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ lineId: id }).parse(d))
  .handler(async ({ data, context }) => lineAudioUrl(db(context), data.lineId));
