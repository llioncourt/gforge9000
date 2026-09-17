#!/usr/bin/env node
/**
 * Translation catalogue validation.
 *
 * Checks, for every locale against the source locale (English):
 *  - invalid JSON
 *  - missing namespace files
 *  - missing keys
 *  - extra keys the source locale does not define
 *  - structural mismatches (object vs string)
 *  - empty translations
 *  - interpolation placeholders that differ between locales
 *
 * Exits with code 1 when any relevant inconsistency is found.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const localesDir = join(root, "src/i18n/locales");
const SOURCE = "en";
/** Locales generated at runtime, with no files on disk. */
const VIRTUAL_LOCALES = new Set(["en-XA"]);

const configSrc = readFileSync(join(root, "src/i18n/config.ts"), "utf8");
const namespaces = [
  ...configSrc.matchAll(/export const NAMESPACES = \[([\s\S]*?)\] as const;/g),
]
  .flatMap((m) => [...m[1].matchAll(/"([\w-]+)"/g)].map((x) => x[1]));

const locales = readdirSync(localesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((l) => !VIRTUAL_LOCALES.has(l));

const errors = [];
const warnings = [];

function flatten(obj, prefix = "", out = new Map()) {
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) flatten(value, path, out);
    else out.set(path, value);
  }
  return out;
}

function placeholders(value) {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((m) => m[1]).sort();
}

function read(locale, ns) {
  const file = join(localesDir, locale, `${ns}.json`);
  if (!existsSync(file)) {
    errors.push(`${locale}/${ns}.json is missing`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    errors.push(`${locale}/${ns}.json is not valid JSON: ${err.message}`);
    return null;
  }
}

if (!namespaces.length) {
  console.error("Could not read NAMESPACES from src/i18n/config.ts");
  process.exit(1);
}

let totalKeys = 0;

for (const ns of namespaces) {
  const source = read(SOURCE, ns);
  if (!source) continue;
  const sourceKeys = flatten(source);
  totalKeys += sourceKeys.size;

  if (sourceKeys.size === 0) warnings.push(`${SOURCE}/${ns}.json is empty`);

  for (const [key, value] of sourceKeys) {
    if (typeof value === "string" && value.trim() === "") {
      errors.push(`${SOURCE}/${ns}.json: empty value for "${key}"`);
    }
  }

  for (const locale of locales) {
    if (locale === SOURCE) continue;
    const target = read(locale, ns);
    if (!target) continue;
    const targetKeys = flatten(target);

    for (const [key, value] of sourceKeys) {
      if (!targetKeys.has(key)) {
        errors.push(`${locale}/${ns}.json: missing key "${key}"`);
        continue;
      }
      const other = targetKeys.get(key);
      if (typeof other !== typeof value) {
        errors.push(`${locale}/${ns}.json: "${key}" has a different type than ${SOURCE}`);
        continue;
      }
      if (typeof other === "string" && other.trim() === "") {
        errors.push(`${locale}/${ns}.json: empty translation for "${key}"`);
        continue;
      }
      const a = placeholders(value).join(",");
      const b = placeholders(other).join(",");
      if (a !== b) {
        errors.push(
          `${locale}/${ns}.json: "${key}" interpolation mismatch (${SOURCE}: {${a}} / ${locale}: {${b}})`,
        );
      }
    }

    for (const key of targetKeys.keys()) {
      if (!sourceKeys.has(key)) {
        errors.push(`${locale}/${ns}.json: extra key "${key}" not present in ${SOURCE}`);
      }
    }
  }
}

console.log(
  `i18n:check — ${namespaces.length} namespaces, ${locales.length} locales, ${totalKeys} source keys`,
);
for (const w of warnings) console.warn(`warning: ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`error: ${e}`);
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log("No problems found.");
