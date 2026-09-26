import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { listVoices, readOwnVoiceKey, speakAsCharacter } from "./tts.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- table newer than generated types
type AnyDb = any;

/** Only says whether a key exists; the key itself never goes back to the browser. */
export const getVoiceKeyStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    hasKey: Boolean(await readOwnVoiceKey(context.supabase as AnyDb, context.userId)),
  }));

export const saveVoiceKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ apiKey: z.string().trim().min(10).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await (context.supabase as AnyDb)
      .from("user_voice_keys")
      .upsert({ user_id: context.userId, api_key: data.apiKey, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeVoiceKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await (context.supabase as AnyDb).from("user_voice_keys").delete().eq("user_id", context.userId);
    return { ok: true };
  });

export const getVoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => listVoices(context.supabase as AnyDb, context.userId));

export const speakCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ characterId: z.string().uuid(), text: z.string().min(1).max(2500) }).parse(d),
  )
  .handler(async ({ data, context }) =>
    speakAsCharacter(context.supabase as AnyDb, context.userId, data.characterId, data.text),
  );
