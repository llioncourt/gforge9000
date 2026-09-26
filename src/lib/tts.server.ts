/**
 * Character speech via each person's OWN ElevenLabs account. The key is read
 * with the caller's RLS-scoped client, so a request can only ever spend the
 * credits of the account that made it — never the app owner's.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const API = "https://api.elevenlabs.io";
export const TTS_MAX_CHARS = 2500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- table newer than generated types
type Db = SupabaseClient<any>;

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

/** Speaks `text` in the character's saved voice; returns base64 MP3. */
export async function speakAsCharacter(
  db: Db,
  userId: string,
  characterId: string,
  text: string,
): Promise<{ audio_base64: string; voice_name: string | null; mime: string }> {
  const clean = text.trim();
  if (!clean || clean.length > TTS_MAX_CHARS) {
    throw new Error(`text must be between 1 and ${TTS_MAX_CHARS} characters`);
  }
  const { data: ch, error } = await db
    .from("characters")
    .select("voice_id, voice_name")
    .eq("id", characterId)
    .maybeSingle();
  if (error || !ch) throw new Error("Character not found.");
  const row = ch as { voice_id: string | null; voice_name: string | null };
  if (!row.voice_id) throw new Error("Choose a voice for this character first.");
  const key = await requireKey(db, userId);
  const res = await fetch(
    `${API}/v1/text-to-speech/${encodeURIComponent(row.voice_id)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      // Fixed settings + fixed model keep a character sounding the same every time.
      body: JSON.stringify({
        text: clean,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.6, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true },
      }),
    },
  );
  if (!res.ok) await elevenFail(res);
  const buf = await res.arrayBuffer();
  return {
    audio_base64: Buffer.from(buf).toString("base64"),
    voice_name: row.voice_name,
    mime: "audio/mpeg",
  };
}
