import { supabase } from "@/integrations/supabase/client";

export const MODEL_BUCKET = "models";
export const MODEL_MAX_BYTES = 50 * 1024 * 1024;

/** Pure validation so it can be unit-tested without a network. */
export function validateModelFile(file: { size: number; name: string }): string | null {
  if (!/\.(glb)$/i.test(file.name)) return "Use a .glb file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MODEL_MAX_BYTES) {
    return `File is too large (max ${Math.round(MODEL_MAX_BYTES / 1024 / 1024)} MB).`;
  }
  return null;
}

/** Models live under `<user id>/<character id>/…`, which is what RLS checks. */
export function modelPathFor(userId: string, characterId: string) {
  return `${userId}/${characterId}/${crypto.randomUUID()}.glb`;
}

export async function uploadModel(characterId: string, file: File): Promise<string> {
  const invalid = validateModelFile(file);
  if (invalid) throw new Error(invalid);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You need to be signed in to upload a model.");
  const path = modelPathFor(auth.user.id, characterId);
  const { error } = await supabase.storage
    .from(MODEL_BUCKET)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: "model/gltf-binary" });
  if (error) throw new Error(error.message);
  return path;
}

export async function removeModel(path: string) {
  const { error } = await supabase.storage.from(MODEL_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function modelUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(MODEL_BUCKET)
    .createSignedUrl(path, 60 * 60 * 8);
  if (error) return null;
  return data?.signedUrl ?? null;
}
