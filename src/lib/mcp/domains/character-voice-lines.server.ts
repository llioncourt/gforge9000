/**
 * Saved spoken lines per character ("Falas"). Not sound effects: nothing here
 * touches campaign_audio. Audio is generated with the CALLER's own ElevenLabs
 * account and cached, so an unchanged line is never paid for twice.
 */
import { z } from "zod/v4";
import {
  actionRouter,
  deleteReply,
  detailReply,
  domainOutput,
  listReply,
  loadCharacter,
  requireCharacterWrite,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, Structured, ToolRegistrar } from "@/lib/mcp/kit.server";
import { TTS_MAX_CHARS, type Db } from "@/lib/tts.server";
import {
  createLine,
  deleteLine,
  getLine,
  lineAudioUrl,
  listLines,
  reorderLines,
  speakLine,
  updateLine,
} from "@/lib/voice-lines.server";

const text = z.string().min(1).max(TTS_MAX_CHARS);
const label = z.string().max(120).nullable().optional();

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("list"), character_id: uuid })
    .describe("List a character's saved lines in order."),
  z.object({ action: z.literal("get"), line_id: uuid }).describe("Read one saved line."),
  z
    .object({
      action: z.literal("create"),
      character_id: uuid,
      text,
      label,
      generate_audio: z.boolean().optional(),
    })
    .describe(
      "Add a line. With generate_audio, also voice it (caller's ElevenLabs credits). Owner or GM only.",
    ),
  z
    .object({
      action: z.literal("update"),
      line_id: uuid,
      text: text.optional(),
      label,
      position: z.number().int().min(0).max(100000).optional(),
      visible_to_players: z.boolean().optional(),
    })
    .describe(
      "Edit a line. Changing text marks existing audio as stale until regenerated. Owner or GM only.",
    ),
  z
    .object({ action: z.literal("delete"), line_id: uuid })
    .describe("Delete a line. Owner or GM only."),
  z
    .object({
      action: z.literal("reorder"),
      character_id: uuid,
      ordered_ids: z.array(uuid).max(500),
    })
    .describe("Set the order of a character's lines. Owner or GM only."),
  z
    .object({ action: z.literal("speak_line"), line_id: uuid, regenerate: z.boolean().optional() })
    .describe(
      "Return a 15-minute signed audio_url for the line, generating audio if missing (or when regenerate). " +
        "Uses the caller's ElevenLabs account; cached audio costs nothing.",
    ),
  z
    .object({ action: z.literal("get_audio_url"), line_id: uuid })
    .describe("Signed audio_url for existing audio; never generates."),
]);

export function registerCharacterVoiceLines(tool: ToolRegistrar, ctx: McpToolContext): void {
  const db = () => ctx.supabase as unknown as Db;
  tool(
    "character_voice_lines",
    {
      title: "Character voice lines",
      description:
        "A character's library of saved spoken lines (not sound effects). Actions: list, get, create, " +
        "update, delete, reorder, speak_line (signed audio URL, generating with the caller's own " +
        "ElevenLabs account if needed), get_audio_url. Owner or campaign GM edit; players only see lines " +
        "marked visible_to_players.",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      list: async (i) => {
        await loadCharacter(ctx, i.character_id);
        const lines = await listLines(db(), i.character_id);
        return listReply("voice lines", lines as unknown as Structured[], lines.length);
      },
      get: async (i) => {
        const line = await getLine(db(), i.line_id);
        return detailReply(`Line ${line.label ?? line.id}.`, line as unknown as Structured);
      },
      create: async (i) => {
        requireCharacterWrite(await loadCharacter(ctx, i.character_id));
        const line = await createLine(db(), ctx.userId, i);
        return detailReply("Line created.", line as unknown as Structured);
      },
      update: async (i) => {
        const line = await updateLine(db(), i);
        return detailReply("Line updated.", line as unknown as Structured);
      },
      delete: async (i) => {
        await deleteLine(db(), i.line_id);
        return deleteReply("Line deleted.", i.line_id);
      },
      reorder: async (i) => {
        requireCharacterWrite(await loadCharacter(ctx, i.character_id));
        const lines = await reorderLines(db(), i.character_id, i.ordered_ids);
        return listReply("voice lines", lines as unknown as Structured[], lines.length);
      },
      speak_line: async (i) => {
        const r = await speakLine(db(), ctx.userId, i.line_id, i.regenerate ?? false);
        return detailReply("Line audio ready.", {
          line_id: r.line.id,
          audio_url: r.audio_url,
          duration_seconds: r.duration_seconds,
          characters_used: r.characters_used,
          cached: r.cached,
        });
      },
      get_audio_url: async (i) => {
        const r = await lineAudioUrl(db(), i.line_id);
        return detailReply("Line audio URL.", r as unknown as Structured);
      },
    }),
  );
}
