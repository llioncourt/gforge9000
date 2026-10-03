/**
 * Shared, safety-checked file intake for assistant (MCP) tools.
 *
 * A remote assistant cannot stream a large file inside a JSON request, so every
 * media domain offers the same four ways in:
 *
 *  - `prepare_upload`  — returns a short-lived signed target the caller writes to
 *  - `finalize_upload` — confirms the object landed and creates/updates the row
 *  - `upload_from_url` — the server fetches an HTTPS source itself
 *  - `upload_base64`   — small payloads only, with a hard size ceiling
 *
 * Every bucket stays private. Read access is only ever handed out as a
 * short-lived signed URL, and only after the caller has been authorized.
 */

import type { Client } from "@/lib/mcp/kit.server";

/** Base64 intake is deliberately capped far below the storage limits. */
export const MAX_BASE64_BYTES = 8 * 1024 * 1024;

/** Signed URLs handed to an assistant are intentionally short-lived. */
export const SIGNED_URL_SECONDS = 600;

/* ------------------------------------------------------------------ */
/* Address safety                                                      */
/* ------------------------------------------------------------------ */

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata",
  "metadata.google.internal",
  "instance-data",
]);

function isBlockedIpv4(host: string): boolean {
  const parts = host.split(".");
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return false;
  const [a, b] = octets as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isBlockedIpv6(host: string): boolean {
  const value = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fe80") || value.startsWith("fc") || value.startsWith("fd")) return true;
  if (value.startsWith("::ffff:")) {
    const mapped = value.slice(7);
    // Dotted form ("::ffff:10.0.0.1") is checked directly; the URL parser
    // usually normalizes IPv4-mapped addresses to two hex groups instead
    // ("::ffff:a9fe:a9fe"), so decode that form back to dotted decimal too.
    if (mapped.includes(".")) return isBlockedIpv4(mapped);
    const hexGroups = mapped.split(":");
    if (hexGroups.length === 2 && hexGroups.every((group) => /^[0-9a-f]{1,4}$/.test(group))) {
      const bytes = hexGroups.flatMap((group) => {
        const padded = group.padStart(4, "0");
        return [parseInt(padded.slice(0, 2), 16), parseInt(padded.slice(2, 4), 16)];
      });
      return isBlockedIpv4(bytes.join("."));
    }
    // Unrecognized ::ffff: form — refuse rather than risk letting a private
    // address through unchecked.
    return true;
  }
  return false;
}

/**
 * Rejects anything that is not a plain public HTTPS address.
 *
 * Known limitation: the server runtime has no DNS resolver, so a hostname that
 * resolves to a private address cannot be caught before the request is made.
 * Literal private addresses, loopback names, cloud metadata names and internal
 * suffixes are refused, and every redirect hop is checked the same way.
 */
export function assertPublicHttpsUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("That is not a valid web address.");
  }
  if (url.protocol !== "https:") throw new Error("Only https addresses are accepted.");
  if (url.username || url.password) throw new Error("That web address is not accepted.");

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(host)) throw new Error("That web address is not accepted.");
  if (/(^|\.)(local|internal|localdomain|home\.arpa)$/.test(host)) {
    throw new Error("That web address is not accepted.");
  }
  if (isBlockedIpv4(host) || isBlockedIpv6(host)) {
    throw new Error("That web address is not accepted.");
  }
  return url;
}

/* ------------------------------------------------------------------ */
/* Remote fetch                                                        */
/* ------------------------------------------------------------------ */

export interface FetchedFile {
  bytes: Uint8Array;
  mime: string;
  size: number;
}

function assertMime(mime: string, allowed: readonly string[]): void {
  const value = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!allowed.includes(value)) {
    throw new Error(`Unsupported file type "${value || "unknown"}".`);
  }
}

/**
 * Hosts the server may download images from. Everything else is refused.
 * Edit this list to allow another source. Exact hostnames only.
 *
 * Why an allow-list: this runtime cannot resolve-and-pin DNS (see TD-002 in
 * git history), so arbitrary hosts cannot be made SSRF-safe. Restricting to a
 * small set of known public file hosts closes that gap.
 */
export const ALLOWED_REMOTE_HOSTS: readonly string[] = [
  "s.3daistudio.com",
  "3dai-service-fs.fsn1.your-objectstorage.com",
];

export const REMOTE_MAX_BYTES = 15 * 1024 * 1024;
export const REMOTE_TIMEOUT_MS = 20_000;
export const REMOTE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_REDIRECTS = 3;

export interface RemoteImage extends FetchedFile {
  width: number | null;
  height: number | null;
  ext: "jpg" | "png" | "webp";
}

function assertAllowedRemoteUrl(raw: string): URL {
  const url = assertPublicHttpsUrl(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (url.port && url.port !== "443") throw new Error("That web address is not accepted.");
  if (!ALLOWED_REMOTE_HOSTS.includes(host)) {
    throw new Error("Downloads from that site are not allowed.");
  }
  return url;
}

/** Identifies jpeg/png/webp from the file's own bytes and reads its size. */
export function sniffImage(
  bytes: Uint8Array,
): { mime: (typeof REMOTE_IMAGE_TYPES)[number]; ext: RemoteImage["ext"]; width: number | null; height: number | null } | null {
  const b = bytes;
  if (
    b.length >= 24 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    return { mime: "image/png", ext: "png", width: dv.getUint32(16), height: dv.getUint32(20) };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) {
    let width: number | null = null;
    let height: number | null = null;
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i += 1; continue; }
      const marker = b[i + 1]!;
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = (b[i + 2]! << 8) | b[i + 3]!;
      if (
        (marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      ) {
        height = (b[i + 5]! << 8) | b[i + 6]!;
        width = (b[i + 7]! << 8) | b[i + 8]!;
        break;
      }
      i += 2 + len;
    }
    return { mime: "image/jpeg", ext: "jpg", width, height };
  }
  if (
    b.length >= 30 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    const chunk = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
    let width: number | null = null;
    let height: number | null = null;
    if (chunk === "VP8X") {
      width = 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16));
      height = 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16));
    } else if (chunk === "VP8 ") {
      width = (b[26]! | (b[27]! << 8)) & 0x3fff;
      height = (b[28]! | (b[29]! << 8)) & 0x3fff;
    } else if (chunk === "VP8L") {
      const bits = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
      width = (bits & 0x3fff) + 1;
      height = ((bits >>> 14) & 0x3fff) + 1;
    }
    return { mime: "image/webp", ext: "webp", width, height };
  }
  return null;
}

/**
 * Downloads a jpeg/png/webp image from an allow-listed https host.
 * Https only, no literal/private addresses, redirects followed manually and
 * only to allow-listed hosts, 15 MB cap, 20 s timeout, type checked by bytes.
 */
export async function fetchRemoteImage(
  rawUrl: string,
  options: { maxBytes?: number; fetchImpl?: typeof fetch } = {},
): Promise<RemoteImage> {
  const cap = Math.min(options.maxBytes ?? REMOTE_MAX_BYTES, REMOTE_MAX_BYTES);
  const doFetch = options.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(REMOTE_TIMEOUT_MS);
  let url = assertAllowedRemoteUrl(rawUrl);
  let response: Response | null = null;
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      response = await doFetch(url.toString(), { redirect: "manual", signal });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("The download was redirected without a destination.");
        url = assertAllowedRemoteUrl(new URL(location, url).toString());
        response = null;
        continue;
      }
      break;
    }
    if (!response) throw new Error("Too many redirects.");
    if (!response.ok) throw new Error(`The download failed (status ${response.status}).`);
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > cap) throw new Error("That file is too large (max 15 MB).");
    if (!response.body) throw new Error("The download was empty.");

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > cap) {
        await reader.cancel();
        throw new Error("That file is too large (max 15 MB).");
      }
      chunks.push(value);
    }
    if (total === 0) throw new Error("The download was empty.");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const kind = sniffImage(bytes);
    if (!kind) throw new Error("Only JPEG, PNG or WebP images are accepted.");
    return { bytes, size: total, mime: kind.mime, ext: kind.ext, width: kind.width, height: kind.height };
  } catch (error) {
    if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
      throw new Error("The download took too long (limit 20 seconds).");
    }
    throw error;
  }
}

/** Back-compat wrapper used by domains; images only. */
export async function fetchRemoteFile(
  rawUrl: string,
  options: { maxBytes: number; allowedMime: readonly string[] },
): Promise<FetchedFile> {
  const file = await fetchRemoteImage(rawUrl, { maxBytes: options.maxBytes });
  assertMime(file.mime, options.allowedMime);
  return file;
}

/* ------------------------------------------------------------------ */
/* Base64 intake                                                       */
/* ------------------------------------------------------------------ */

export function decodeBase64File(
  data: string,
  mime: string,
  options: { maxBytes: number; allowedMime: readonly string[] },
): FetchedFile {
  assertMime(mime, options.allowedMime);
  const payload =
    data.includes(",") && data.startsWith("data:") ? data.slice(data.indexOf(",") + 1) : data;
  const cap = Math.min(options.maxBytes, MAX_BASE64_BYTES);
  // 4 base64 characters carry 3 bytes; refuse before allocating.
  if ((payload.length / 4) * 3 > cap + 8)
    throw new Error("That file is too large to send directly.");

  let binary: string;
  try {
    binary = atob(payload.replace(/\s+/g, ""));
  } catch {
    throw new Error("The file data could not be read.");
  }
  if (binary.length > cap) throw new Error("That file is too large to send directly.");
  if (binary.length === 0) throw new Error("That file is empty.");

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, mime: mime.toLowerCase(), size: bytes.byteLength };
}

/* ------------------------------------------------------------------ */
/* Storage helpers                                                     */
/* ------------------------------------------------------------------ */

export interface PreparedUpload {
  bucket: string;
  path: string;
  upload_url: string;
  token: string;
  expires_in_seconds: number;
  instructions: string;
}

/** Short-lived signed target the caller writes the file bytes to. */
export async function prepareSignedUpload(
  supabase: Client,
  bucket: string,
  path: string,
): Promise<PreparedUpload> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data)
    throw new Error(`Could not prepare the upload: ${error?.message ?? "unknown"}`);
  return {
    bucket,
    path,
    upload_url: data.signedUrl,
    token: data.token,
    expires_in_seconds: SIGNED_URL_SECONDS,
    instructions:
      "PUT the file bytes to upload_url with the matching content type, then call the finalize action with this same path.",
  };
}

export async function uploadBytes(
  supabase: Client,
  bucket: string,
  path: string,
  file: FetchedFile,
): Promise<void> {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, file.bytes, { contentType: file.mime, upsert: true });
  if (error) throw new Error(`The file could not be stored: ${error.message}`);
}

export interface StoredObject {
  path: string;
  size: number;
  mime: string;
}

/** Confirms an object really exists at the expected private path. */
export async function verifyStoredObject(
  supabase: Client,
  bucket: string,
  path: string,
  options: { maxBytes: number; allowedMime: readonly string[] },
): Promise<StoredObject> {
  const slash = path.lastIndexOf("/");
  const folder = slash === -1 ? "" : path.slice(0, slash);
  const file = slash === -1 ? path : path.slice(slash + 1);

  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, { search: file, limit: 100 });
  if (error) throw new Error(`The stored file could not be checked: ${error.message}`);
  const match = (data ?? []).find((item) => item.name === file);
  if (!match) throw new Error("No file was found at that location. Upload it first.");

  const metadata = (match.metadata ?? {}) as { size?: number; mimetype?: string };
  const size = Number(metadata.size ?? 0);
  const mime = String(metadata.mimetype ?? "").toLowerCase();
  if (size > options.maxBytes) throw new Error("That file is too large.");
  assertMime(mime, options.allowedMime);
  return { path, size, mime };
}

export async function signedReadUrl(
  supabase: Client,
  bucket: string,
  path: string,
  seconds = SIGNED_URL_SECONDS,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error || !data) throw new Error(`Could not create a link: ${error?.message ?? "unknown"}`);
  return data.signedUrl;
}

export async function removeStoredObject(
  supabase: Client,
  bucket: string,
  path: string | null | undefined,
): Promise<void> {
  if (!path) return;
  await supabase.storage.from(bucket).remove([path]);
}

/** Random, collision-free object name that keeps the original extension. */
export function storagePathFor(prefix: string, fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext =
    dot > 0
      ? fileName
          .slice(dot + 1)
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
      : "bin";
  return `${prefix}/${crypto.randomUUID()}.${ext || "bin"}`;
}
