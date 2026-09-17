/**
 * Guards against drift between the GM-only fields declared in the app and the
 * list the database uses to strip them from player reads. If either side gains
 * a private field without the other, this fails.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KINDS } from "@/lib/entity-kinds";

function databaseKeyMap(): Record<string, string[]> {
  const dir = "supabase/migrations";
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  let latest: Record<string, string[]> | null = null;
  for (const file of files) {
    const sql = readFileSync(join(dir, file), "utf8");
    if (!sql.includes("gm_data_keys")) continue;
    const match = sql.match(/'(\{"[A-Z_]+":\[[^']*)'::jsonb\s*->\s*_kind/);
    if (match?.[1]) latest = JSON.parse(match[1]) as Record<string, string[]>;
  }
  return latest ?? {};
}

describe("GM-only field parity", () => {
  const fromDb = databaseKeyMap();

  it("reads the key map out of the migrations", () => {
    expect(Object.keys(fromDb).length).toBeGreaterThan(0);
  });

  it("matches the fields the app marks as GM-only", () => {
    const fromApp: Record<string, string[]> = {};
    for (const kind of KINDS) {
      const keys = kind.fields.filter((f) => f.gm).map((f) => f.key).sort();
      if (keys.length) fromApp[kind.kind] = keys;
    }
    const normalise = (map: Record<string, string[]>) =>
      Object.fromEntries(
        Object.entries(map)
          .map(([k, v]) => [k, [...v].sort()] as const)
          .sort(([a], [b]) => a.localeCompare(b)),
      );
    expect(normalise(fromApp)).toEqual(normalise(fromDb));
  });
});
