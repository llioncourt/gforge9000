/** Saved spoken lines per character. Permissions come from RLS on the caller's client. */
import {
  audioHash,
  loadCharacterVoice,
  signedAudioUrl,
  synthesize,
  TTS_MODEL_ID,
  TTS_VOICE_SETTINGS,
  validateText,
  type Db,
} from "@/lib/tts.server";

export interface VoiceLine {
  id: string;
  character_id: string;
  campaign_id: string | null;
  label: string | null;
  text: string;
  audio_path: string | null;
  audio_hash: string | null;
  duration_seconds: number | null;
  voice_id: string | null;
  position: number;
  visible_to_players: boolean;
  created_at: string;
  updated_at: string;
  /** Audio exists but no longer matches the text/voice. */
  stale: boolean;
}

const TABLE = "character_voice_lines";

function check(error: { message: string } | null, what: string): void {
  if (error) throw new Error(`${what}: ${error.message}`);
}

function decorate(rows: Record<string, unknown>[], voiceId: string | null): VoiceLine[] {
  return rows.map((r) => {
    const line = r as unknown as VoiceLine;
    const stale = Boolean(
      line.audio_path && (!voiceId || line.audio_hash !== audioHash(voiceId, line.text)),
    );
    return { ...line, duration_seconds: line.duration_seconds == null ? null : Number(line.duration_seconds), stale };
  });
}

export async function listLines(db: Db, characterId: string): Promise<VoiceLine[]> {
  const ch = await loadCharacterVoice(db, characterId);
  const { data, error } = await db
    .from(TABLE)
    .select("*")
    .eq("character_id", characterId)
    .order("position")
    .order("created_at");
  check(error, "Listing lines");
  return decorate(data ?? [], ch.voice_id);
}

export async function getLine(db: Db, lineId: string): Promise<VoiceLine> {
  const { data, error } = await db.from(TABLE).select("*").eq("id", lineId).maybeSingle();
  check(error, "Reading line");
  if (!data) throw new Error("Line not found.");
  const ch = await loadCharacterVoice(db, (data as { character_id: string }).character_id);
  return decorate([data], ch.voice_id)[0]!;
}

async function attachAudio(db: Db, userId: string, line: VoiceLine) {
  const r = await synthesize(db, userId, line.character_id, line.text);
  const { error } = await db
    .from(TABLE)
    .update({
      audio_path: r.path,
      audio_hash: r.hash,
      duration_seconds: r.duration_seconds,
      voice_id: r.voice_id,
      model_id: TTS_MODEL_ID,
      voice_settings: TTS_VOICE_SETTINGS,
    })
    .eq("id", line.id);
  check(error, "Saving audio");
  return r;
}

export async function createLine(
  db: Db,
  userId: string,
  input: { character_id: string; text: string; label?: string | null; generate_audio?: boolean },
): Promise<VoiceLine> {
  const text = validateText(input.text);
  const ch = await loadCharacterVoice(db, input.character_id);
  const { data: last } = await db
    .from(TABLE)
    .select("position")
    .eq("character_id", input.character_id)
    .order("position", { ascending: false })
    .limit(1);
  const position = ((last?.[0] as { position?: number } | undefined)?.position ?? -1) + 1;
  const { data, error } = await db
    .from(TABLE)
    .insert({
      character_id: input.character_id,
      campaign_id: ch.campaign_id,
      text,
      label: input.label?.trim() || null,
      position,
      created_by: userId,
    })
    .select("*")
    .single();
  check(error, "Creating line");
  const line = decorate([data], ch.voice_id)[0]!;
  if (input.generate_audio) {
    await attachAudio(db, userId, line);
    return getLine(db, line.id);
  }
  return line;
}

export async function updateLine(
  db: Db,
  input: { line_id: string; text?: string; label?: string | null; position?: number; visible_to_players?: boolean },
): Promise<VoiceLine> {
  const patch: Record<string, unknown> = {};
  if (input.text !== undefined) patch["text"] = validateText(input.text);
  if (input.label !== undefined) patch["label"] = input.label?.trim() || null;
  if (input.position !== undefined) patch["position"] = input.position;
  if (input.visible_to_players !== undefined) patch["visible_to_players"] = input.visible_to_players;
  if (Object.keys(patch).length === 0) throw new Error("Nothing to update.");
  // Editing text leaves the old audio in place; the line shows as out of date
  // until someone asks to regenerate, so no credits are spent per edit.
  const { data, error } = await db.from(TABLE).update(patch).eq("id", input.line_id).select("id");
  check(error, "Updating line");
  if (!data?.length) throw new Error("Line not found or not editable.");
  return getLine(db, input.line_id);
}

export async function deleteLine(db: Db, lineId: string): Promise<void> {
  const { data, error } = await db.from(TABLE).delete().eq("id", lineId).select("id");
  check(error, "Deleting line");
  if (!data?.length) throw new Error("Line not found or not editable.");
}

export async function reorderLines(db: Db, characterId: string, orderedIds: string[]): Promise<VoiceLine[]> {
  for (const [i, id] of orderedIds.entries()) {
    const { error } = await db.from(TABLE).update({ position: i }).eq("id", id).eq("character_id", characterId);
    check(error, "Reordering lines");
  }
  return listLines(db, characterId);
}

export async function speakLine(db: Db, userId: string, lineId: string, regenerate = false) {
  let line = await getLine(db, lineId);
  let cached = true;
  let charactersUsed = 0;
  if (!line.audio_path || regenerate) {
    // Cache by hash: regenerating an unchanged line reuses the stored audio.
    const r = await attachAudio(db, userId, line);
    cached = r.cached;
    charactersUsed = r.characters_used;
    line = await getLine(db, lineId);
  }
  return {
    line,
    audio_url: await signedAudioUrl(db, line.audio_path!),
    duration_seconds: line.duration_seconds,
    characters_used: charactersUsed,
    cached,
  };
}

export async function lineAudioUrl(db: Db, lineId: string) {
  const line = await getLine(db, lineId);
  if (!line.audio_path) throw new Error("This line has no audio yet.");
  return { line_id: line.id, audio_url: await signedAudioUrl(db, line.audio_path), stale: line.stale, duration_seconds: line.duration_seconds };
}
