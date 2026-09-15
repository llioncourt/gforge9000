import { supabase } from "@/integrations/supabase/client";
import { ASSET_BUCKET } from "@/lib/assets";
import { PORTRAIT_BUCKET } from "@/lib/portrait";

/**
 * Lore entry images may live in the portraits bucket (uploaded on the entry) or
 * in the campaign library bucket (imported/picked from the library). Try both.
 */
export async function entityImageUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  for (const bucket of [PORTRAIT_BUCKET, ASSET_BUCKET]) {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 8);
    if (data?.signedUrl) return data.signedUrl;
  }
  return null;
}
