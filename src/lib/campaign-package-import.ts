/**
 * Browser wrapper around the shared import core (see
 * `campaign-package-import-core.ts` for why the core exists, takes an
 * injected client, and stores images without AVIF conversion). This file
 * exists only so existing callers keep importing `importCampaignPackage`
 * unchanged, and it restores the one thing the server-safe core cannot do:
 * converting images to AVIF with the browser canvas/WASM encoder before
 * upload.
 */
import { unzipSync } from "fflate";
import { supabase } from "@/integrations/supabase/client";
import { convertToAvif, isImageFile } from "@/lib/image-avif";
import {
  MAX_CAMPAIGN_PACKAGE_BYTES,
  type CampaignImportSummary,
} from "@/lib/campaign-package";
import { importCampaignPackageCore } from "@/lib/campaign-package-import-core";

type Archive = Record<string, Uint8Array>;

/**
 * Re-encodes every image entry inside the ZIP to AVIF before handing the
 * archive to the shared core, so the browser path keeps its smaller,
 * consistently-formatted stored images. Non-image files (audio, video, JSON)
 * pass through untouched; already-AVIF images pass through untouched too.
 */
async function convertImagesToAvif(archive: Archive): Promise<Archive> {
  const converted: Archive = { ...archive };
  for (const [path, bytes] of Object.entries(archive)) {
    if (/\.avif$/i.test(path)) continue;
    const name = path.split("/").pop() || "file";
    const file = new File([bytes.slice().buffer as ArrayBuffer], name);
    if (!isImageFile(file)) continue;
    const avif = await convertToAvif(file);
    converted[path] = new Uint8Array(await avif.arrayBuffer());
  }
  return converted;
}

/**
 * Imports a campaign package ZIP for the signed-in user. The manifest is fully
 * validated before any row is written; if a later step fails on a campaign this
 * import created, that campaign is removed so nothing half-imported is left.
 *
 * Importing the same package twice reuses the campaign it produced the first
 * time (matched on the package's own content, never on its name, so two
 * unrelated campaigns sharing a title stay separate) and refreshes its lore
 * and characters instead of duplicating them. Media that has no identity of
 * its own — notes, images, videos, albums, sound effects — is written on the
 * first import only, so a repeat cannot pile up copies.
 */
export async function importCampaignPackage(
  file: File,
  onProgress?: (step: string) => void,
): Promise<CampaignImportSummary> {
  if (file.size > MAX_CAMPAIGN_PACKAGE_BYTES) {
    throw new Error(
      `The package is larger than ${Math.round(MAX_CAMPAIGN_PACKAGE_BYTES / 1024 / 1024)} MB.`,
    );
  }
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) throw new Error("You need to be signed in.");

  const archive = unzipSync(new Uint8Array(await file.arrayBuffer())) as Archive;
  const withAvif = await convertImagesToAvif(archive);

  // Re-zip so the shared core (which unzips its input) sees the AVIF bytes.
  const { zipSync } = await import("fflate");
  const rezipped = zipSync(withAvif, { level: 0 });

  return importCampaignPackageCore(supabase, user.id, rezipped, onProgress);
}
