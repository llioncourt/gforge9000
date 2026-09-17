/**
 * Stable identity for imported records.
 *
 * Re-importing the same file must update the records it created the first
 * time instead of producing a second copy. Identity is never the display name:
 * it is the exporter's own identifier when the file carries one, otherwise a
 * deterministic hash of the file's meaningful content.
 *
 * Classification: CONFIGURABLE (data plumbing, not a game rule).
 */
import { slugifyText } from "@/lib/text-normalize";

/** FNV-1a (64 bit), hex. Deterministic across runs and platforms. */
export function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < value.length; index++) {
    hash = (hash ^ BigInt(value.charCodeAt(index))) & mask;
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

/** JSON with object keys sorted, so key order in a file cannot change the hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export interface CharacterIdentitySource {
  import_key?: string | undefined;
  character: { id?: string | undefined; name: string; [key: string]: unknown };
  entries: { kind: string; name: string; points?: number; levels?: number }[];
}

/**
 * Identity of a character file. Files exported by this app carry an
 * `import_key`; older exports fall back to the character id they were exported
 * with, and files with neither get a content hash of the sheet's identity plus
 * its entry list.
 */
export function characterImportKey(source: CharacterIdentitySource): string {
  if (source.import_key?.trim()) return source.import_key.trim();
  const id = typeof source.character.id === "string" ? source.character.id.trim() : "";
  if (id) return `ucf-character:${id}`;
  const fingerprint = canonicalJson({
    name: slugifyText(source.character.name),
    entries: source.entries
      .map((entry) => `${entry.kind}:${slugifyText(entry.name)}:${entry.points ?? 0}:${entry.levels ?? 1}`)
      .sort(),
  });
  return `ucf-character-hash:${stableHash(fingerprint)}`;
}

/** Identity of a lore entity coming from a lore export or a campaign package. */
export function loreEntityImportKey(entityKey: string): string {
  return `lore:${entityKey.trim()}`;
}

/**
 * Identity of a campaign package. Derived from the manifest content, so the
 * same ZIP re-imported updates its campaign while two unrelated campaigns that
 * merely share a name stay separate.
 */
export function campaignPackageImportKey(manifest: unknown): string {
  return `ucf-campaign:${stableHash(canonicalJson(manifest))}`;
}

/** Identity of a record contained in a campaign package. */
export function packageChildImportKey(
  campaignKey: string,
  kind: string,
  key: string,
): string {
  return `${campaignKey}#${kind}:${key.trim()}`;
}
