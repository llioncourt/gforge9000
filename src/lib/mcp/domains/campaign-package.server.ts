/**
 * Campaign package (UCF-CAMPAIGN-PACKAGE v1) staging + validation.
 *
 * The real exporter/importer (`src/lib/campaign-package-export.ts`,
 * `src/lib/campaign-package-import.ts`) are browser-coupled: they import the
 * browser Supabase singleton at module scope and, transitively, a dozen other
 * `src/lib/*` modules that do the same (assets, battlemap, campaign-intro,
 * campaign-sound-fx, campaign-soundtrack, lore, portrait). Per the domain
 * contract those modules must not be imported here. Only the pure format
 * module `src/lib/campaign-package.ts` (schema + validators, no IO) is
 * reused, so this file cannot invent a second format.
 *
 * What this leaves possible server-side: staging a package file in the
 * caller's own private storage prefix, and fully validating it with the exact
 * same schema and cross-reference checks the app's importer uses, before any
 * row is written. Actually building the ZIP (export) and actually writing the
 * campaign's rows and media (import) require the browser-coupled code path
 * and are not reimplemented here — the app's own Export button / New
 * Campaign → Import dialog must be used for those two steps.
 */

import { unzipSync } from "fflate";
import { z } from "zod/v4";
import {
  actionRouter,
  boundedText,
  domainOutput,
  fail,
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
import {
  decodeBase64File,
  fetchRemoteFile,
  prepareSignedUpload,
  removeStoredObject,
  storagePathFor,
  uploadBytes,
  verifyStoredObject,
} from "@/lib/mcp/uploads.server";

const BUCKET = "campaign-packages";
const PACKAGE_MIME = ["application/zip", "application/x-zip-compressed"] as const;

const NOT_SERVER_SIDE =
  "This step needs the app's own browser code (it reads/writes many storage buckets through the " +
  "signed-in browser client) and cannot run through the assistant. Use the app's Export button, " +
  'or the "New Campaign → Import" dialog, to do this step.';

function ownStoragePath(ctx: McpToolContext, path: string): void {
  if (!path.startsWith(`${ctx.userId}/`)) {
    throw new Error("That storage path does not belong to you.");
  }
}

const input = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("export"), campaign_id: uuid })
    .describe(
      `Export a campaign as a package ZIP. GM only. Not available through the assistant: ${NOT_SERVER_SIDE}`,
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
    .describe("Download a campaign package ZIP from a public https URL into the caller's own storage prefix."),
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
      `Validate then actually import a staged campaign package. GM only. Not available through the assistant: ${NOT_SERVER_SIDE}`,
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

async function validateStagedPackage(
  ctx: McpToolContext,
  storagePath: string,
): Promise<ManifestReport> {
  ownStoragePath(ctx, storagePath);
  const stored = await verifyStoredObject(ctx.supabase, BUCKET, storagePath, {
    maxBytes: MAX_CAMPAIGN_PACKAGE_BYTES,
    allowedMime: PACKAGE_MIME,
  });
  const { data, error } = await ctx.supabase.storage.from(BUCKET).download(stored.path);
  if (error || !data) throw new Error(`Could not read the staged package: ${error?.message ?? "unknown"}`);
  const archive = unzipSync(new Uint8Array(await data.arrayBuffer())) as Record<string, Uint8Array>;
  const manifestBytes = archive["campaign.json"];
  if (!manifestBytes) throw new Error("The package must contain campaign.json at its root.");
  const manifest = parseCampaignPackageManifest(new TextDecoder().decode(manifestBytes));

  const problems = validateCampaignPackage(manifest);
  const missing = referencedFiles(manifest).filter(
    (path) => !archive[path] && !archive[path.replace(/^\.\//, "")],
  );

  return {
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
}

export function registerCampaignPackage(tool: ToolRegistrar, ctx: McpToolContext): void {
  tool(
    "campaign_package",
    {
      title: "Campaign package import/export",
      description:
        "Stage and validate campaign package ZIPs (the app's UCF-CAMPAIGN-PACKAGE v1 format). " +
        "Actions: export (build and store a package ZIP, GM only — not available through the " +
        "assistant, use the app), prepare_import_upload (get a signed upload target under the " +
        "caller's own storage prefix), upload_import_from_url (fetch a ZIP from a public https " +
        "URL into the caller's prefix, changes data), upload_import_base64 (stage a small ZIP " +
        "from inline base64, changes data), finalize_import (validate a staged package with no " +
        "writes and report what would be created/updated), import (validate then actually import " +
        "a staged package, GM only — not available through the assistant, use the app), " +
        "delete_staged (remove a staged/exported file under the caller's own prefix — staged " +
        "files are never auto-expired, so this is the cleanup step, deletes data).",
      inputSchema: input,
      outputSchema: domainOutput,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
    },
    actionRouter<z.infer<typeof input>>({
      export: async (i) => {
        const campaign = await loadCampaign(ctx, i.campaign_id);
        requireGmFor(campaign, "export this campaign");
        throw new Error(NOT_SERVER_SIDE);
      },

      prepare_import_upload: async (i) => {
        const path = storagePathFor(ctx.userId, i.file_name);
        const prepared = await prepareSignedUpload(ctx.supabase, BUCKET, path);
        return {
          content: [{ type: "text" as const, text: `Upload target prepared.\n\n${JSON.stringify(prepared, null, 2)}` }],
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
        const report = await validateStagedPackage(ctx, i.storage_path);
        const summary = report.valid
          ? `Package "${report.campaign_name}" is valid.`
          : `Package "${report.campaign_name}" has problems: ${[...report.problems, ...report.missing_files.map((f) => `missing file "${f}"`)].join("; ")}`;
        return {
          content: [{ type: "text" as const, text: `${summary}\n\n${JSON.stringify(report, null, 2)}` }],
          structuredContent: { item: report as unknown as Record<string, unknown> },
        };
      },

      import: async (i) => {
        ownStoragePath(ctx, i.storage_path);
        const report = await validateStagedPackage(ctx, i.storage_path);
        if (!report.valid) {
          throw new Error(
            `Package is not valid, refusing to import: ${[...report.problems, ...report.missing_files.map((f) => `missing file "${f}"`)].join("; ")}`,
          );
        }
        throw new Error(NOT_SERVER_SIDE);
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
