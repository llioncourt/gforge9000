import { supabase } from "@/integrations/supabase/client";
import { AVIF_MIME, convertToAvif } from "@/lib/image-avif";

export const PORTRAIT_BUCKET = "portraits";
export const PORTRAIT_MAX_BYTES = 5 * 1024 * 1024;
export const PORTRAIT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/avif"];

/** Pure validation so it can be unit-tested without a network. */
export function validatePortraitFile(file: { type: string; size: number; name: string }): string | null {
  const type = (file.type || "").toLowerCase();
  const byExtension = /\.(png|jpe?g|webp|gif|avif)$/i.test(file.name);
  if (!PORTRAIT_TYPES.includes(type) && !byExtension) {
    return "Use a PNG, JPEG, WebP, GIF or AVIF image.";
  }
  if (file.size > PORTRAIT_MAX_BYTES) {
    return `Image is too large (max ${Math.round(PORTRAIT_MAX_BYTES / 1024 / 1024)} MB).`;
  }
  if (file.size === 0) return "That file is empty.";
  return null;
}

export function portraitExtension(name: string, type: string): string {
  const fromName = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (fromName) return fromName === "jpeg" ? "jpg" : fromName;
  if (type.includes("png")) return "png";
  if (type.includes("webp")) return "webp";
  if (type.includes("gif")) return "gif";
  if (type.includes("avif")) return "avif";
  return "jpg";
}

/** Portraits live under `<user id>/<character id>/…`, which is what RLS checks. */
export function portraitPathFor(userId: string, characterId: string, file: { name: string; type: string }) {
  return `${userId}/${characterId}/${crypto.randomUUID()}.${portraitExtension(file.name, file.type)}`;
}

export async function uploadPortrait(characterId: string, file: File): Promise<string> {
  const invalid = validatePortraitFile(file);
  if (invalid) throw new Error(invalid);
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error("You need to be signed in to upload a portrait.");
  const avif = await convertToAvif(file);
  const path = portraitPathFor(auth.user.id, characterId, avif);
  const { error } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .upload(path, avif, { cacheControl: "3600", upsert: false, contentType: AVIF_MIME });

  if (error) throw new Error(error.message);
  return path;
}

export async function removePortrait(path: string) {
  const { error } = await supabase.storage.from(PORTRAIT_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

export async function portraitUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(PORTRAIT_BUCKET)
    .createSignedUrl(path, 60 * 60 * 8);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Initials used by the neutral placeholder — no third-party artwork. */
export function portraitInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
