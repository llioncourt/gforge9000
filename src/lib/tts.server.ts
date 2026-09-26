/**
 * Character speech via each person's OWN ElevenLabs account. The key is read
 * with the caller's RLS-scoped client, so a request can only ever spend the
 * credits of the account that made it — never the app owner's.
 *
 * Generated audio is stored privately and cached by a hash of
 * (voice, model, settings, text): the same line is never paid for twice.
 */
import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const API = "https://api.elevenlabs.io";
export const TTS_MAX_CHARS = 2500;
export const VOICE_BUCKET = "character-voice-lines";
export const TTS_MODEL_ID = "eleven_multilingual_v2";
// Fixed settings + fixed model keep a character sounding the same every time.
export const TTS_VOICE_SETTINGS = {
  stability: 0.6,
  similarity_boost: 0.8,
  style: 0.3,
  use_speaker_boost: true,
} as const;
const SIGNED_URL_SECONDS = 15 * 60;
const MP3_BITS_PER_SECOND = 128_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tables newer than generated types
export type Db = SupabaseClient<any>;

export function audioHash(voiceId: string, text: string): string {
  return createHash("sha256")
    .update(JSON.stringify([voiceId, TTS_MODEL_ID, TTS_VOICE_SETTINGS, text.trim()]))
    .digest("hex");
}

export async function readOwnVoiceKey(db: Db, userId: string): Promise<string | null> {
  const { data } = await db
    .from("user_voice_keys")
    .select("api_key")
    .eq("user_id", userId)
    .maybeSingle();
  return (data as { api_key?: string } | null)?.api_key ?? null;
}

async function requireKey(db: Db, userId: string): Promise<string> {
  const key = await readOwnVoiceKey(db, userId);
  if (!key) throw new Error("Add your ElevenLabs key in your profile first.");
  return key;
}

async function elevenFail(res: Response): Promise<never> {
  const body = await res.text();
  console.error(`ElevenLabs [${res.status}]: ${body}`);
  if (res.status === 401) throw new Error("Your ElevenLabs key was not accepted.");
  throw new Error(`ElevenLabs request failed [${res.status}]: ${body.slice(0, 300)}`);
}

export async function listVoices(db: Db, userId: string) {
  const key = await requireKey(db, userId);
  const res = await fetch(`${API}/v1/voices`, { headers: { "xi-api-key": key } });
  if (!res.ok) await elevenFail(res);
  const json = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
  return (json.voices ?? []).map((v) => ({ voice_id: v.voice_id, name: v.name }));
}

export async function loadCharacterVoice(db: Db, characterId: string) {
  const { data: ch, error } = await db
    .from("characters")
    .select("voice_id, voice_name, campaign_id")
    .eq("id", characterId)
    .maybeSingle();
  if (error || !ch) throw new Error("Character not found.");
  return ch as { voice_id: string | null; voice_name: string | null; campaign_id: string | null };
}

export function validateText(text: string): string {
  const clean = text.trim();
  if (!clean || clean.length > TTS_MAX_CHARS) {
    throw new Error(`text must be between 1 and ${TTS_MAX_CHARS} characters`);
  }
  return clean;
}

export interface SynthResult {
  path: string;
  hash: string;
  voice_id: string;
  voice_name: string | null;
  duration_seconds: number;
  characters_used: number;
  cached: boolean;
}

/** Makes (or reuses) the MP3 for `text` in the character's saved voice. */
export async function synthesize(
  db: Db,
  userId: string,
  characterId: string,
  text: string,
): Promise<SynthResult> {
  const clean = validateText(text);
  const ch = await loadCharacterVoice(db, characterId);
  if (!ch.voice_id) throw new Error("Choose a voice for this character first.");
  const hash = audioHash(ch.voice_id, clean);
  const file = `${hash}.mp3`;
  const path = `${characterId}/${file}`;

  const { data: existing } = await db.storage.from(VOICE_BUCKET).list(characterId, { search: file });
  const hit = (existing ?? []).find((o) => o.name === file);
  if (hit) {
    const size = Number((hit.metadata as { size?: number } | null)?.size ?? 0);
    return {
      path,
      hash,
      voice_id: ch.voice_id,
      voice_name: ch.voice_name,
      duration_seconds: Math.round(((size * 8) / MP3_BITS_PER_SECOND) * 10) / 10,
      characters_used: 0,
      cached: true,
    };
  }

  const key = await requireKey(db, userId);
  const res = await fetch(
    `${API}/v1/text-to-speech/${encodeURIComponent(ch.voice_id)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text: clean, model_id: TTS_MODEL_ID, voice_settings: TTS_VOICE_SETTINGS }),
    },
  );
  if (!res.ok) await elevenFail(res);
  const buf = await res.arrayBuffer();
  const { error: upErr } = await db.storage
    .from(VOICE_BUCKET)
    .upload(path, new Uint8Array(buf), { contentType: "audio/mpeg", upsert: true });
  if (upErr) throw new Error("Could not save the audio. Only the sheet owner or the GM can create lines.");
  return {
    path,
    hash,
    voice_id: ch.voice_id,
    voice_name: ch.voice_name,
    duration_seconds: Math.round(((buf.byteLength * 8) / MP3_BITS_PER_SECOND) * 10) / 10,
    characters_used: clean.length,
    cached: false,
  };
}

export async function signedAudioUrl(db: Db, path: string): Promise<string> {
  const { data, error } = await db.storage.from(VOICE_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
  if (error || !data) throw new Error("Audio not available.");
  return data.signedUrl;
}

async function downloadBase64(db: Db, path: string): Promise<string> {
  const { data, error } = await db.storage.from(VOICE_BUCKET).download(path);
  if (error || !data) throw new Error("Audio not available.");
  return Buffer.from(await data.arrayBuffer()).toString("base64");
}

/** One-off line in the character's saved voice (no line is saved). */
export async function speakAsCharacter(
  db: Db,
  userId: string,
  characterId: string,
  text: string,
  inline = false,
) {
  const r = await synthesize(db, userId, characterId, text);
  return {
    audio_url: await signedAudioUrl(db, r.path),
    duration_seconds: r.duration_seconds,
    characters_used: r.characters_used,
    voice_name: r.voice_name,
    cached: r.cached,
    mime: "audio/mpeg",
    ...(inline ? { audio_base64: await downloadBase64(db, r.path) } : {}),
  };
}
