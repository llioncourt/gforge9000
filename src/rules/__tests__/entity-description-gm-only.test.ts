/**
 * The full `description` column of a lore entry is GM canon, exactly like
 * `gm_notes`. These tests read the migrations that are actually applied and
 * prove that no non-GM caller — plain player or non-GM entry owner — can pull
 * that text out of the database through any read path:
 *
 *   1. the filtered read function `public.list_entities_safe`,
 *   2. the version history table `public.entity_revisions` (snapshots hold the
 *      whole row, GM text included),
 *   3. a direct read of `public.entities`.
 *
 * The matching MCP-level proof lives in `mcp-tools.test.ts`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MCP_GM_ONLY_FIELDS } from "@/lib/mcp/domains/shared.server";

const DIR = "supabase/migrations";

function migrations(): string[] {
  return readdirSync(DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(DIR, file), "utf8"));
}

/** The body of the last migration that redefines the given object. */
function latestDefinition(marker: RegExp): string {
  let found = "";
  for (const sql of migrations()) {
    const parts = sql.split(marker);
    if (parts.length > 1) found = parts[parts.length - 1]!;
  }
  return found;
}

describe("entity description is GM-only in the database", () => {
  it("blanks description for non-GM callers in the filtered read, like gm_notes", () => {
    const body = latestDefinition(/CREATE OR REPLACE FUNCTION public\.list_entities_safe/);
    expect(body).not.toBe("");
    const select = body.slice(0, body.indexOf("FROM public.entities"));

    for (const column of ["description", "gm_notes"]) {
      expect(select).toMatch(
        new RegExp(
          `CASE WHEN private\\.is_campaign_gm\\(e\\.campaign_id, auth\\.uid\\(\\)\\) THEN e\\.${column} ELSE NULL END`,
        ),
      );
    }
    // Player-facing text stays readable.
    expect(select).toMatch(/e\.player_description,/);
    expect(select).toMatch(/e\.summary,/);
  });

  it("restricts entry version history to the game master", () => {
    const body = latestDefinition(
      /CREATE POLICY entity_revisions_select ON public\.entity_revisions/,
    );
    expect(body).not.toBe("");
    const policy = body.slice(0, body.indexOf(";"));
    expect(policy).toContain("private.is_campaign_gm(campaign_id, auth.uid())");
    expect(policy).not.toContain("can_view_entity");
    expect(policy).not.toContain("owner_user_id");
  });

  it("restricts direct reads of the entries table to the game master", () => {
    const body = latestDefinition(/CREATE POLICY entities_select ON public\.entities/);
    expect(body).not.toBe("");
    const policy = body.slice(0, body.indexOf(";"));
    expect(policy).toContain("private.is_campaign_gm(campaign_id, auth.uid())");
    // A non-GM owner must not get an unredacted row straight from the table.
    expect(policy).not.toContain("owner_user_id");
  });

  it("keeps restoring a saved version GM-only", () => {
    const body = latestDefinition(/CREATE OR REPLACE FUNCTION public\.restore_entity_revision/);
    expect(body).not.toBe("");
    expect(body).toContain("private.is_campaign_gm(_rev.campaign_id, auth.uid())");
  });

  it("matches the GM-only field list the app strips from replies", () => {
    expect([...MCP_GM_ONLY_FIELDS.entity].sort()).toEqual(["description", "gm_notes"]);
  });
});
