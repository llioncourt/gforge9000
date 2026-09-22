/**
 * Browser wrapper around the shared export core (see
 * `campaign-package-export-core.ts` for why the core exists and takes an
 * injected client). This file exists only so existing callers keep importing
 * `buildCampaignPackageZip` unchanged.
 */
import { supabase } from "@/integrations/supabase/client";
import {
  buildCampaignPackageZipCore,
  type CampaignExportProgress,
  type CampaignExportStep,
} from "@/lib/campaign-package-export-core";

export type { CampaignExportProgress, CampaignExportStep };

export async function buildCampaignPackageZip(
  campaignId: string,
  onProgress?: CampaignExportProgress,
): Promise<{ blob: Blob; fileName: string }> {
  const { bytes, fileName } = await buildCampaignPackageZipCore(supabase, campaignId, onProgress);
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: "application/zip" });
  return { blob, fileName };
}
