/**
 * Deterministic hashing and stable keys for the Campaign Adaptation Studio.
 *
 * Everything here is pure: the same input always produces the same output, on
 * the server and in the browser, so a re-scan can be compared byte-for-byte
 * against the previous one.
 */

/** Canonical JSON: object keys sorted, undefined dropped, no incidental spacing. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      out[key] = canonicalize(source[key]);
    }
    return out;
  }
  if (typeof value === "number" && !Number.isFinite(value)) return null;
  return value;
}

/**
 * Synchronous 128-bit FNV-1a digest, rendered as 32 hex chars.
 *
 * Used for stable keys and content hashes where a cryptographic guarantee is
 * not needed but determinism and zero async are. Binary fingerprints use
 * `sha256Hex` instead.
 */
export function stableHash(input: string): string {
  // Two independent FNV-1a 64-bit lanes, concatenated.
  let hiA = 0xcbf2_9ce4,
    loA = 0x8422_2325;
  let hiB = 0x8496_2f5d,
    loB = 0xd7c1_2e3b;

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    loA ^= code;
    [hiA, loA] = fnvMul(hiA, loA);
    loB ^= code ^ 0x5f;
    [hiB, loB] = fnvMul(hiB, loB);
  }
  return hex32(hiA) + hex32(loA) + hex32(hiB) + hex32(loB);
}

/** 64-bit multiply by the FNV prime 0x100000001b3, split across two 32-bit words. */
function fnvMul(hi: number, lo: number): [number, number] {
  const prime = 0x1b3;
  const loMul = lo * prime;
  const carry = Math.floor(loMul / 0x1_0000_0000);
  const nextLo = loMul >>> 0;
  const nextHi = (hi * prime + carry + lo * 0x100) >>> 0;
  return [nextHi >>> 0, nextLo >>> 0];
}

function hex32(value: number): string {
  return (value >>> 0).toString(16).padStart(8, "0");
}

/** Stable hash of any JSON-serialisable value. */
export function hashValue(value: unknown): string {
  return stableHash(canonicalJson(value));
}

/**
 * A stable key identifies one logical item across re-scans and re-generations.
 * It never contains random data, so the same source always maps to the same key.
 */
export function stableKey(kind: string, ...parts: (string | number | null | undefined)[]): string {
  const tail = parts
    .map((part) => (part === null || part === undefined ? "" : String(part)))
    .join("|");
  return `${kind}:${stableHash(tail)}`;
}

/** SHA-256 of binary content, as lowercase hex. Used to fingerprint and dedupe files. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const view = new Uint8Array(bytes);
  const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
