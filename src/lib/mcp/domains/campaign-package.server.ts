/**
 * Campaign package (UCF-CAMPAIGN-PACKAGE v1) export/import + staging.
 *
 * `export` and `import` run the same shared, format-owning cores the app's
 * own Export button and Import dialog use
 * (`src/lib/campaign-package-export-core.ts`,
 * `src/lib/campaign-package-import-core.ts`), just against the caller's own
 * RLS-scoped Supabase client instead of the browser singleton — never a
 * service role. The only real behavioural difference from the app's browser
 * import is documented in the import core's module comment: images are
 * stored with their original bytes/content-type instead of being converted
 * to AVIF, because AVIF encoding needs a browser canvas.
 */

import { unzipSync } from "fflate";
import { z } from "zod/v4";
import {
  actionRouter,
  boundedText,
  domainOutput,
  loadCampaign,
  requireGmFor,
  uuid,
} from "@/lib/mcp/kit.server";
import type { McpToolContext, ToolRegistrar } from "@/lib/mcp/kit.server";
import {
  parseCampaignPackageManifest,
  referencedFiles,
  validateCampaignPackage,
  MAX_CAMPAIGN_PACKAGE_BYTES,
} from "@/lib/campaign-package";
import { buildCampaignPackageZipCore } from "@/lib/campaign-package-export-core";
import { importCampaignPackageCore } from "@/lib/campaign-package-import-core";
import {
  decodeBase64File,
  fetchRemoteFile,
  prepareSignedUpload,
  removeStoredObject,
  signedReadUrl,
  storagePathFor,
  uploadBytes,
  verifyStoredObject,
} from "@/lib/mcp/uploads.server";

const BUCKET = "campaign-packages";
const PACKAGE_MIME = ["application/zip", "application/x-zip-compressed"] as const;

function ownStoragePath(ctx: McpToolContext, path: string): void {
  if (!path.startsWith(`${ctx.userId}/`)) {
    throw new Error("That storage path does not belong to you.");
  }
}

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("export"), campaign_id: uuid })
    .describe(
      "Export a campaign as a package ZIP. GM only. Builds the ZIP, stores it under the " +
        "caller's own storage prefix, and returns a short-lived signed link to download it.",
    ),
  z
    .object({
      action: z.literal("prepare_import_upload"),
      file_name: boundedText(255),
      byte_size: z.number().int().min(1).max(MAX_CAMPAIGN_PACKAGE_BYTES),
    })
    .describe(
      "Get a short-lived signed upload target, under the caller's own storage prefix, to stage a " +
        "campaign package ZIP for import.",
    ),
  z
    .object({
      action: z.literal("upload_import_from_url"),
      url: z.string().max(2000),
    })
    .describe(
      "Download a campaign package ZIP from a public https URL into the caller's own storage " +
        "prefix. Currently disabled everywhere for security reasons (see prepare_import_upload " +
        "or upload_import_base64 instead).",
    ),
  z
    .object({
      action: z.literal("upload_import_base64"),
      data: z.string().max(12_000_000),
      file_name: boundedText(255),
    })
    .describe("Stage a campaign package ZIP from inline base64 bytes (small files only)."),
  z
    .object({ action: z.literal("finalize_import"), storage_path: boundedText(400) })
    .describe(
      "Validate a staged campaign package against the exact schema and cross-reference checks " +
        "the app's importer uses, without writing anything. Returns what would be created/updated.",
    ),
  z
    .object({ action: z.literal("import"), storage_path: boundedText(400) })
    .describe(
      "Validate then actually import a staged campaign package under the caller's own storage " +
        "prefix. Creates a new campaign the caller is GM of, or refreshes the campaign the same " +
        "package was previously imported into. Changes data.",
    ),
  z
    .object({ action: z.literal("delete_staged"), storage_path: boundedText(400) })
    .describe(
      "Delete a staged or exported package file under the caller's own storage prefix. Staged " +
        "and exported files are never auto-expired, so this is how they are cleaned up. Deletes data.",
    ),
]);

interface ManifestReport {
  format: string;
  version: number;
  campaign_name: string;
  problems: string[];
  would_create: {
    notes: number;
    entities: number;
    relationships: number;
    assets: number;
    maps: number;
    videos: number;
    sound_fx: number;
    soundtrack_albums: number;
    characters: number;
  };
  missing_files: string[];
  valid: boolean;
}

/** Downloads and fully validates a staged package without writing anything. */
async function validateStagedPackage(
  ctx: McpToolContext,
  storagePath: string,
): Promise<{ report: ManifestReport; zipBytes: Uint8Array }> {
  ownStoragePath(ctx, storagePath);
  const stored = await verifyStoredObject(ctx.supabase, BUCKET, storagePath, {
    maxBytes: MAX_CAMPAIGN_PACKAGE_BYTES,
    allowedMime: PACKAGE_MIME,
  });
  const { data, error } = await ctx.supabase.storage.from(BUCKET).download(stored.path);
  if (error || !data)
    throw new Error(`Could not read the staged package: ${error?.message ?? "unknown"}`);
  const zipBytes = new Uint8Array(await data.arrayBuffer());
  const archive = unzipSync(zipBytes) as Record<string, Uint8Array>;
  const manifestBytes = archive["campaign.json"];
  if (!manifestBytes) throw new Error("The package must contain campaign.json at its root.");
  const manifest = parseCampaignPackageManifest(new TextDecoder().decode(manifestBytes));

  const problems = validateCampaignPackage(manifest);
  const missing = referencedFiles(manifest).filter(
    (path) => !archive[path] && !archive[path.replace(/^\.\//, "")],
  );

  const report: ManifestReport = {
    format: manifest.format,
    version: manifest.version,
    campaign_name: manifest.campaign.name,
    problems,
    would_create: {
      notes: manifest.notes.length,
      entities: manifest.lore.entities.length,
      relationships: manifest.lore.relationships.length,
      assets: manifest.assets.length,
      maps: manifest.maps.length,
      videos: manifest.videos.length,
      sound_fx: manifest.sound_fx.length,
      soundtrack_albums: manifest.soundtracks.length,
      characters: manifest.characters.length,
    },
    missing_files: missing,
    valid: problems.length === 0 && missing.length === 0,
  };
  return { report, zipBytes };
}

export function registerCampaignPackage(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "campaign_package",
    {
      title: "Campaign package import/export",
      description:
        "Export and import campaign package ZIPs (the app's UCF-CAMPAIGN-PACKAGE v1 format). " +
        "Actions: export (build a package ZIP for a campaign and return a signed download link, " +
        "GM only, changes data by storing the file), prepare_import_upload (get a signed upload " +
        "target under the caller's own storage prefix), upload_import_from_url (currently " +
        "disabled — use prepare_import_upload or upload_import_base64 instead), " +
        "upload_import_base64 (stage a small ZIP from inline base64, changes data), " +
        "finalize_import (validate a staged package with no writes and report what would be " +
        "created/updated), import (validate then actually import a staged package, creating or " +
        "refreshing a campaign the caller is GM of, changes data), delete_staged (remove a " +
        "staged/exported file under the caller's own prefix — staged files are never " +
        "auto-expired, so this is the cleanup step, deletes data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      export: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "export this campaign");
        const { bytes, fileName } = await buildCampaignPackageZipCore(ctx.supabase, campaign.id);
        const path = storagePathFor(ctx.userId, fileName);
        await uploadBytes(ctx.supabase, BUCKET, path, {
          bytes,
          mime: "application/zip",
          size: bytes.byteLength,
        });
        const signedUrl = await signedReadUrl(ctx.supabase, BUCKET, path);
        const item = {
          storage_path: path,
          byte_size: bytes.byteLength,
          file_name: fileName,
          signed_url: signedUrl,
        };
        return {
          content: [
            {
              type: "text" as const,
              text: `Exported "${campaign.name}" (${bytes.byteLength} bytes).\n\n${JSON.stringify(item, null, 2)}`,
            },
          ],
          structuredContent: { item },
        };
      },

      prepare_import_upload: async (i) => {
        const path = storagePathFor(ctx.userId, i.file_name);
        const prepared = await prepareSignedUpload(ctx.supabase, BUCKET, path);
        return {
          content: [
            {
              type: "text" as const,
              text: `Upload target prepared.\n\n${JSON.stringify(prepared, null, 2)}`,
            },
          ],
          structuredContent: { item: { ...prepared } },
        };
      },

      upload_import_from_url: async (i) => {
        const file = await fetchRemoteFile(i.url, {
          maxBytes: MAX_CAMPAIGN_PACKAGE_BYTES,
          allowedMime: PACKAGE_MIME,
        });
        const fileName = new URL(i.url).pathname.split("/").pop() ?? "campaign-package.zip";
        const path = storagePathFor(ctx.userId, fileName);
        await uploadBytes(ctx.supabase, BUCKET, path, file);
        return {
          content: [
            {
              type: "text" as const,
              text: `Staged package at ${path} (${file.size} bytes). Call finalize_import next.`,
            },
          ],
          structuredContent: { item: { path, byte_size: file.size, mime: file.mime } },
        };
      },

      upload_import_base64: async (i) => {
        const file = decodeBase64File(i.data, "application/zip", {
          maxBytes: MAX_CAMPAIGN_PACKAGE_BYTES,
          allowedMime: PACKAGE_MIME,
        });
        const path = storagePathFor(ctx.userId, i.file_name);
        await uploadBytes(ctx.supabase, BUCKET, path, file);
        return {
          content: [
            {
              type: "text" as const,
              text: `Staged package at ${path} (${file.size} bytes). Call finalize_import next.`,
            },
          ],
          structuredContent: { item: { path, byte_size: file.size, mime: file.mime } },
        };
      },

      finalize_import: async (i) => {
        const { report } = await validateStagedPackage(ctx, i.storage_path);
        const summary = report.valid
          ? `Package "${report.campaign_name}" is valid.`
          : `Package "${report.campaign_name}" has problems: ${[...report.problems, ...report.missing_files.map((f) => `missing file "${f}"`)].join("; ")}`;
        return {
          content: [
            { type: "text" as const, text: `${summary}\n\n${JSON.stringify(report, null, 2)}` },
          ],
          structuredContent: { item: report as unknown as Record<string, unknown> },
        };
      },

      import: async (i) => {
        ownStoragePath(ctx, i.storage_path);
        const { report, zipBytes } = await validateStagedPackage(ctx, i.storage_path);
        if (!report.valid) {
          throw new Error(
            `Package is not valid, refusing to import: ${[...report.problems, ...report.missing_files.map((f) => `missing file "${f}"`)].join("; ")}`,
          );
        }
        const summary = await importCampaignPackageCore(ctx.supabase, ctx.userId, zipBytes);
        return {
          content: [
            {
              type: "text" as const,
              text: `Imported "${report.campaign_name}".\n\n${JSON.stringify(summary, null, 2)}`,
            },
          ],
          structuredContent: { item: summary as unknown as Record<string, unknown> },
        };
      },

      delete_staged: async (i) => {
        ownStoragePath(ctx, i.storage_path);
        await removeStoredObject(ctx.supabase, BUCKET, i.storage_path);
        return {
          content: [{ type: "text" as const, text: `Deleted staged file "${i.storage_path}".` }],
          structuredContent: { deleted: true, id: i.storage_path },
        };
      },
    }),
  );
}
