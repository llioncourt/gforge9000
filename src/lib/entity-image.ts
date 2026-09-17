import { supabase } from "@/integrations/supabase/client";
import { ASSET_BUCKET } from "@/lib/assets";
import { PORTRAIT_BUCKET } from "@/lib/portrait";

/**
 * A lore entry image is either a photo uploaded on the entry itself or a file
 * picked from the campaign library — two different storage areas.
 *
 * The area is derived from the reference itself instead of being probed: an
 * uploaded entry photo is always filed under the entry's own id, anything else
 * belongs to the campaign library. A reference may also name its area
 * explicitly ("<area>::<path>"). Either way one image costs one request.
 */
const SEPARATOR = "::";
const AREAS = [PORTRAIT_BUCKET, ASSET_BUCKET] as const;
export type ImageArea = (typeof AREAS)[number];


export function resolveImageRef(
  reference: string,
  entityId?: string,
): { bucket: ImageArea; path: string } {
  const split = reference.indexOf(SEPARATOR);
  if (split > 0) {
    const area = reference.slice(0, split) as ImageArea;
    if (AREAS.includes(area)) return { bucket: area, path: reference.slice(split + SEPARATOR.length) };
  }
  const owner = reference.split("/")[1];
  const bucket: ImageArea = entityId && owner === entityId ? PORTRAIT_BUCKET : ASSET_BUCKET;
  return { bucket, path: reference };
}

export async function entityImageUrl(
  reference: string | null | undefined,
  entityId?: string,
): Promise<string | null> {
  if (!reference) return null;
  const { bucket, path } = resolveImageRef(reference, entityId);
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 8);
  return data?.signedUrl ?? null;
}
