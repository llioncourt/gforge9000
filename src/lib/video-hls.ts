/**
 * Browser-side HLS packaging for campaign videos.
 *
 * The backend runtime cannot transcode video, so the GM's browser converts the
 * uploaded MP4 into HLS (a master playlist + short .ts segments) with ffmpeg.wasm
 * before uploading. Playback then streams segment by segment instead of pulling
 * one large progressive file.
 *
 * Everything in this module is browser-only and lazily imported.
 */
import { supabase } from "@/integrations/supabase/client";
import { CAMPAIGN_INTRO_BUCKET } from "@/lib/campaign-intro";
// The module core is served from the app origin so the FFmpeg worker can import
// it under the site's content-security policy. The large wasm binary remains a
// hosted asset and is fetched directly by the core.
import ffmpegWasmAsset from "@/assets/ffmpeg-core.wasm.asset.json";

// Version the public filename so a previously cached UMD build can never be
// reused after switching the worker to the required ESM core.
const ffmpegCoreUrl = "/ffmpeg/ffmpeg-core-esm-0.12.10.js";
const ffmpegWasmUrl = ffmpegWasmAsset.url;

export const HLS_SEGMENT_SECONDS = 6;

export type HlsStage = "loading" | "packaging" | "low" | "uploading" | "done";

export type HlsProgress = {
  stage: HlsStage;
  /** 0..1 within the whole operation. */
  percent: number;
  label: string;
};

export type HlsPackageFile = { name: string; data: Uint8Array; contentType: string };

export type HlsPackage = {
  masterName: string;
  files: HlsPackageFile[];
  variants: string[];
};

function contentTypeFor(name: string) {
  if (name.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
  if (name.endsWith(".ts")) return "video/mp2t";
  return "application/octet-stream";
}

/** Convert an MP4 file into HLS renditions inside the browser. */
export async function packageVideoAsHls(
  file: File,
  options: { lowQuality?: boolean; onProgress?: (progress: HlsProgress) => void } = {},
): Promise<HlsPackage> {
  const report = options.onProgress ?? (() => undefined);
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { fetchFile } = await import("@ffmpeg/util");

  report({ stage: "loading", percent: 0.02, label: "Preparing the video converter…" });
  const ffmpeg = new FFmpeg();
  await ffmpeg.load({
    coreURL: new URL(ffmpegCoreUrl, window.location.origin).href,
    wasmURL: new URL(ffmpegWasmUrl, window.location.origin).href,
  });

  const lowQuality = options.lowQuality ?? false;
  let phase: { stage: HlsStage; from: number; to: number; label: string } = {
    stage: "packaging",
    from: 0.05,
    to: lowQuality ? 0.45 : 0.8,
    label: "Cutting the video into streaming chunks…",
  };
  ffmpeg.on("progress", ({ progress }) => {
    const ratio = Math.min(Math.max(progress, 0), 1);
    report({
      stage: phase.stage,
      percent: phase.from + (phase.to - phase.from) * ratio,
      label: phase.label,
    });
  });

  await ffmpeg.writeFile("input.mp4", await fetchFile(file));
  report({ stage: "packaging", percent: 0.05, label: "Cutting the video into streaming chunks…" });

  const hlsArgs = (prefix: string, playlist: string) => [
    "-f",
    "hls",
    "-hls_time",
    String(HLS_SEGMENT_SECONDS),
    "-hls_playlist_type",
    "vod",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_filename",
    `${prefix}_%04d.ts`,
    playlist,
  ];

  // Source-quality rendition: stream copy when possible (fast), re-encode as fallback.
  let copied = true;
  try {
    await ffmpeg.exec(["-i", "input.mp4", "-c", "copy", ...hlsArgs("v0", "v0.m3u8")]);
    const check = await ffmpeg.readFile("v0.m3u8");
    if (!check || check.length === 0) throw new Error("empty playlist");
  } catch {
    copied = false;
    await ffmpeg.exec([
      "-i",
      "input.mp4",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "23",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      ...hlsArgs("v0", "v0.m3u8"),
    ]);
  }

  const variants: { playlist: string; bandwidth: number; resolution?: string }[] = [
    { playlist: "v0.m3u8", bandwidth: 3_000_000 },
  ];

  if (lowQuality) {
    phase = { stage: "low", from: 0.45, to: 0.8, label: "Building the low-bandwidth version…" };
    await ffmpeg.exec([
      "-i",
      "input.mp4",
      "-vf",
      "scale=-2:480",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "30",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      ...hlsArgs("v1", "v1.m3u8"),
    ]);
    variants.push({ playlist: "v1.m3u8", bandwidth: 800_000, resolution: "854x480" });
  }

  report({ stage: "uploading", percent: 0.82, label: "Collecting the streaming chunks…" });

  const entries = await ffmpeg.listDir("/");
  const names = entries
    .filter((entry) => !entry.isDir)
    .map((entry) => entry.name)
    .filter((name) => /^v\d(_\d+\.ts|\.m3u8)$/.test(name));

  const files: HlsPackageFile[] = [];
  for (const name of names) {
    const data = await ffmpeg.readFile(name);
    if (typeof data === "string") continue;
    files.push({ name, data: data as Uint8Array, contentType: contentTypeFor(name) });
  }

  const master = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    ...variants.flatMap((variant) => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth}${variant.resolution ? `,RESOLUTION=${variant.resolution}` : ""}`,
      variant.playlist,
    ]),
  ].join("\n");
  files.push({
    name: "master.m3u8",
    data: new TextEncoder().encode(`${master}\n`),
    contentType: contentTypeFor("master.m3u8"),
  });

  try {
    ffmpeg.terminate();
  } catch {
    /* ignore */
  }

  return {
    masterName: "master.m3u8",
    files,
    variants: copied ? variants.map((variant) => variant.playlist) : variants.map((variant) => variant.playlist),
  };
}

/** Upload a packaged HLS bundle and return the master playlist storage path. */
export async function uploadHlsPackage(
  prefix: string,
  bundle: HlsPackage,
  onProgress?: (progress: HlsProgress) => void,
): Promise<string> {
  let done = 0;
  const total = bundle.files.length;
  for (const file of bundle.files) {
    const path = `${prefix}/${file.name}`;
    const body = new Blob([file.data as BlobPart], { type: file.contentType });
    const { error } = await supabase.storage
      .from(CAMPAIGN_INTRO_BUCKET)
      .upload(path, body, { contentType: file.contentType, upsert: true });
    if (error) throw new Error(error.message);
    done += 1;
    onProgress?.({
      stage: "uploading",
      percent: 0.85 + 0.14 * (done / Math.max(total, 1)),
      label: `Uploading streaming chunks (${done} of ${total})…`,
    });
  }
  return `${prefix}/${bundle.masterName}`;
}

/** Delete every stored file that belongs to an HLS bundle. */
export async function removeHlsPackage(masterPath: string) {
  const prefix = masterPath.replace(/\/[^/]+$/, "");
  const { data } = await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).list(prefix, { limit: 1000 });
  const paths = (data ?? []).map((entry) => `${prefix}/${entry.name}`);
  if (paths.length) await supabase.storage.from(CAMPAIGN_INTRO_BUCKET).remove(paths);
}

/**
 * Build a playable master playlist for a private bundle.
 *
 * Storage is private, so each segment needs its own signed URL. The playlists are
 * rewritten with those URLs and served to the player as blob URLs.
 */
export async function resolveHlsPlaylistUrl(masterPath: string): Promise<{ url: string; revoke: () => void }> {
  const prefix = masterPath.replace(/\/[^/]+$/, "");
  const { data: listed, error: listError } = await supabase.storage
    .from(CAMPAIGN_INTRO_BUCKET)
    .list(prefix, { limit: 1000 });
  if (listError) throw new Error(listError.message);
  const names = (listed ?? []).map((entry) => entry.name);
  const { data: signed, error: signError } = await supabase.storage
    .from(CAMPAIGN_INTRO_BUCKET)
    .createSignedUrls(names.map((name) => `${prefix}/${name}`), 60 * 60 * 8);
  if (signError) throw new Error(signError.message);
  const urlByName = new Map<string, string>();
  for (const item of signed ?? []) {
    const name = item.path?.split("/").pop();
    if (name && item.signedUrl) urlByName.set(name, item.signedUrl);
  }

  const created: string[] = [];
  const rewrite = (text: string) =>
    text
      .split("\n")
      .map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) return line;
        return urlByName.get(trimmed) ?? line;
      })
      .join("\n");

  const fetchText = async (name: string) => {
    const url = urlByName.get(name);
    if (!url) throw new Error("This video is still being prepared.");
    const response = await fetch(url);
    if (!response.ok) throw new Error("This video could not be loaded.");
    return response.text();
  };

  const masterName = masterPath.split("/").pop() ?? "master.m3u8";
  const masterText = await fetchText(masterName);
  const variantNames = masterText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  const variantBlobByName = new Map<string, string>();
  for (const variantName of variantNames) {
    const variantText = rewrite(await fetchText(variantName));
    const blobUrl = URL.createObjectURL(new Blob([variantText], { type: "application/vnd.apple.mpegurl" }));
    created.push(blobUrl);
    variantBlobByName.set(variantName, blobUrl);
  }

  const finalMaster = masterText
    .split("\n")
    .map((line) => variantBlobByName.get(line.trim()) ?? line)
    .join("\n");
  const masterUrl = URL.createObjectURL(new Blob([finalMaster], { type: "application/vnd.apple.mpegurl" }));
  created.push(masterUrl);

  return {
    url: masterUrl,
    revoke: () => created.forEach((url) => URL.revokeObjectURL(url)),
  };
}
