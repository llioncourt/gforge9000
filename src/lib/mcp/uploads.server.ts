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

/** Longest redirect chain we will follow when fetching a remote source. */
const MAX_REDIRECTS = 3;

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
  if (value.startsWith("::ffff:")) return isBlockedIpv4(value.slice(7));
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
 * Downloads a remote file with the size limit enforced while reading, so a
 * dishonest `Content-Length` cannot be used to slip a large file through.
 */
export async function fetchRemoteFile(
  rawUrl: string,
  options: { maxBytes: number; allowedMime: readonly string[] },
): Promise<FetchedFile> {
  let url = assertPublicHttpsUrl(rawUrl);
  let response: Response | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    response = await fetch(url, { redirect: "manual", headers: { accept: "*/*" } });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("The source address could not be followed.");
      if (hop === MAX_REDIRECTS) throw new Error("The source address redirects too many times.");
      url = assertPublicHttpsUrl(new URL(location, url).toString());
      continue;
    }
    break;
  }

  if (!response || !response.ok) {
    throw new Error(`The file could not be downloaded (${response?.status ?? "no response"}).`);
  }

  const mime =
    (response.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
  assertMime(mime, options.allowedMime);

  const declared = Number(response.headers.get("content-length") ?? "0");
  if (declared > options.maxBytes) throw new Error("That file is too large.");

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > options.maxBytes) throw new Error("That file is too large.");
  if (buffer.byteLength === 0) throw new Error("That file is empty.");

  return { bytes: buffer, mime, size: buffer.byteLength };
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
