#!/usr/bin/env node
// Reports the JavaScript each screen downloads on first load (gzip), from the
// production build. Run `bun run build` first, then `node scripts/bundle-report.mjs`.
// Pass --json for machine-readable output, --budget <KB> to fail when any screen
// exceeds that many gzip KB.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const root = new URL("..", import.meta.url).pathname;
const serverDir = join(root, ".output/server");
const publicDir = join(root, ".output/public");

const manifestFile = readdirSync(serverDir).find((f) => f.startsWith("_tanstack-start-manifest"));
if (!manifestFile) {
  console.error("No build found. Run `bun run build` first.");
  process.exit(1);
}
const { tsrStartManifest } = await import(pathToFileURL(join(serverDir, manifestFile)).href);
const { routes } = tsrStartManifest();

const sizeCache = new Map();
function gz(asset) {
  if (!sizeCache.has(asset)) {
    const bytes = readFileSync(join(publicDir, asset));
    sizeCache.set(asset, { raw: bytes.length, gzip: gzipSync(bytes).length });
  }
  return sizeCache.get(asset);
}

const parentOf = new Map();
for (const [id, route] of Object.entries(routes)) {
  for (const child of route.children ?? []) parentOf.set(child, id);
}

// Routes with no assets of their own are absent from the manifest but still
// load their ancestors' assets.
for (const route of Object.values(routes)) {
  for (const child of route.children ?? []) routes[child] ??= {};
}

const rows = [];
for (const [id, route] of Object.entries(routes)) {
  if (id === "__root__") continue;
  if (route.children?.length || id.startsWith("/api") || id.includes(".well-known")) continue;
  if (id === "/sitemap.xml") continue;
  const assets = new Set();
  for (let cur = id; cur; cur = parentOf.get(cur)) {
    for (const a of routes[cur]?.preloads ?? []) assets.add(a);
  }
  let raw = 0;
  let gzip = 0;
  for (const a of assets) {
    const s = gz(a);
    raw += s.raw;
    gzip += s.gzip;
  }
  rows.push({ route: id, files: assets.size, rawKB: raw / 1024, gzipKB: gzip / 1024 });
}
rows.sort((a, b) => b.gzipKB - a.gzipKB);

const args = process.argv.slice(2);
if (args.includes("--json")) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log("route".padEnd(32), "files".padStart(6), "raw KB".padStart(9), "gzip KB".padStart(9));
  for (const r of rows) {
    console.log(
      r.route.padEnd(32),
      String(r.files).padStart(6),
      r.rawKB.toFixed(0).padStart(9),
      r.gzipKB.toFixed(0).padStart(9),
    );
  }
}

const budgetIdx = args.indexOf("--budget");
if (budgetIdx !== -1) {
  const budget = Number(args[budgetIdx + 1]);
  const over = rows.filter((r) => r.gzipKB > budget);
  if (over.length) {
    console.error(`\nOver the ${budget} KB gzip budget: ${over.map((r) => r.route).join(", ")}`);
    process.exit(1);
  }
}
