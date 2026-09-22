#!/usr/bin/env node
/**
 * Hardcoded UI string detector.
 *
 * Reports likely user-facing English strings that are still outside the
 * translation system: JSX text nodes and user-visible attributes
 * (placeholder, aria-label, title, alt) written as literals.
 *
 * It deliberately ignores technical values (class names, URLs, IDs, paths,
 * single words in camelCase/kebab-case, numbers, dice notation, etc.).
 *
 * Usage:
 *   node scripts/i18n-scan.mjs            # report
 *   node scripts/i18n-scan.mjs --strict   # exit 1 when findings exist
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const strict = process.argv.includes("--strict");

/** Files that legitimately contain English text outside the UI layer. */
const IGNORED_PATHS = [
  "src/i18n/",
  "src/rules/",
  "src/integrations/",
  "src/routeTree.gen.ts",
  "src/lib/ai-import-guides.ts",
  "src/lib/campaign-package-docs.ts",
  "src/lib/calendar-pack.ts",
  "src/lib/sound-fx-pack.ts",
  "src/lib/campaign-soundtrack-pack.ts",
  "src/lib/lore-import.ts",
  "src/lib/image-prompt.ts",
  "src/routes/api/",
  "src/routes/sitemap[.]xml.ts",
];

const ATTRS = ["placeholder", "aria-label", "title", "alt", "aria-description"];

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else if (/\.(tsx|ts)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}

function isTechnical(text) {
  const value = text.trim();
  if (value.length < 3) return true;
  if (!/[a-zA-Z]/.test(value)) return true;
  if (!/\s/.test(value)) {
    // single token: only flag real words like "Save", not "bg-card" / "sm:flex"
    if (!/^[A-Z][a-z]+$/.test(value)) return true;
  }
  if (/^(https?:|\/|#|\.\/|@)/.test(value)) return true;
  if (/^[a-z0-9-]+(\/[a-z0-9-]+)+$/.test(value)) return true;
  if (/^\d+d\d+/.test(value)) return true;
  if (/^[\w.-]+\.(json|png|jpg|jpeg|webp|avif|zip|md|txt|mp3|wav|mp4|glb)$/i.test(value))
    return true;
  return false;
}

const findings = [];

for (const file of walk(srcDir)) {
  const rel = relative(root, file).replaceAll("\\", "/");
  if (IGNORED_PATHS.some((p) => rel.startsWith(p) || rel === p)) continue;
  const source = readFileSync(file, "utf8");
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
    if (trimmed.startsWith("import ") || trimmed.startsWith("export type")) return;

    // 1. user-visible attributes written as string literals
    for (const attr of ATTRS) {
      const re = new RegExp(`${attr}="([^"{}]+)"`, "g");
      for (const match of line.matchAll(re)) {
        const value = match[1];
        if (attr === "alt" && value.trim() === "") continue;
        if (isTechnical(value)) continue;
        findings.push({ rel, line: index + 1, kind: attr, text: value });
      }
    }

    // 2. JSX text nodes: >Some text<  (TSX only — avoids TS generics like Promise<T>)
    if (!rel.endsWith(".tsx")) return;
    for (const match of line.matchAll(/>([^<>{}\n]+)</g)) {
      const value = match[1];
      if (isTechnical(value)) continue;
      if (!/[a-zA-Z]{3}/.test(value)) continue;
      // TypeScript generics and destructuring fragments look like JSX text on a single line.
      if (
        /(Promise|VariantProps|FieldPath|FieldValues|useState|React\.|=>|&&|\|\||\)\s*$)/.test(
          value,
        )
      )
        continue;
      if (/^\s*[,&:=|]/.test(value)) continue;
      findings.push({ rel, line: index + 1, kind: "jsx-text", text: value.trim() });
    }

    // 3. toast / alert messages with literal sentences
    for (const match of line.matchAll(/toast\.\w+\(\s*"([^"]+)"/g)) {
      findings.push({ rel, line: index + 1, kind: "toast", text: match[1] });
    }
  });
}

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.rel)) byFile.set(f.rel, []);
  byFile.get(f.rel).push(f);
}

if (findings.length === 0) {
  console.log("i18n:scan — no hardcoded user-facing strings found.");
  process.exit(0);
}

for (const [file, items] of [...byFile.entries()].sort()) {
  console.log(`\n${file} (${items.length})`);
  for (const item of items) console.log(`  ${item.line}: [${item.kind}] ${item.text}`);
}
console.log(`\ni18n:scan — ${findings.length} suspicious string(s) in ${byFile.size} file(s).`);
process.exit(strict ? 1 : 0);
