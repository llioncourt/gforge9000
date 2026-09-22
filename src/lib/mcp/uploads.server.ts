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
 * TD-002: `upload_from_url` is disabled everywhere. Do not re-enable it
 * without a genuine resolve-and-pin fetch.
 *
 * Why this cannot be made SSRF-safe on this runtime: to be safe, the code
 * must resolve the hostname, validate every returned address as public, and
 * then guarantee the TCP connection actually goes to one of those validated
 * addresses (otherwise a second, attacker-controlled DNS answer served
 * between validation and connection — "DNS rebinding" — lets a hostname that
 * looked public actually connect to a private/internal address). Cloudflare
 * Workers (workerd) give us no primitive that does both parts safely:
 *  - `node:dns` / `dns.promises.resolve4` are not implemented in workerd
 *    (nodejs_compat does not include a real resolver), so there is no way to
 *    even learn the candidate addresses ourselves.
 *  - The platform `fetch()` takes a hostname and resolves + connects
 *    internally; there is no option to pin it to a caller-chosen IP, so even
 *    a DNS-over-HTTPS lookup we did ourselves could not be trusted to be the
 *    address `fetch()` actually dials.
 *  - `cloudflare:sockets` can open a raw TCP connection to a literal IP, but
 *    TLS certificate validation is then checked against that IP, not the
 *    original hostname, so it would either break certificate validation or
 *    require disabling it — trading SSRF risk for MITM risk. Sending the
 *    real hostname as SNI/Host while connecting to a pinned IP is not
 *    something the available APIs let us do together with normal cert
 *    checks.
 * Since resolve+pin cannot be guaranteed here, per the approved spec this
 * function refuses instead of shipping partial protection.
 */
export async function fetchRemoteFile(
  _rawUrl: string,
  _options: { maxBytes: number; allowedMime: readonly string[] },
): Promise<FetchedFile> {
  throw new Error(
    "Downloading files from a web address is turned off for security reasons. " +
      "Use the signed upload target (prepare_upload / finalize_upload) instead, " +
      "or send small files directly with the base64 upload option.",
  );
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
