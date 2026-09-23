/**
 * Regression tests for P0-02 — MCP `library.search_pack_entries`.
 *
 * The bug: the candidate scan asked PostgREST for a single page larger than
 * the server's row cap, so only the first page of names was ever searched and
 * every later-alphabet pack item ("Sobrevivência" in a 1730-row library) came
 * back empty while the plain listing still showed it.
 *
 * These tests use a fake client that enforces the SAME page cap as PostgREST,
 * so a scan that asks for more than one page at a time fails here too.
 */

import { describe, expect, it } from "vitest";

import {
  findPackMatch,
  loadPackCandidates,
  loadPackCandidatesDetailed,
  type PackClient,
} from "@/lib/pack-match";

/** Mirrors Supabase's default `db.max-rows`. */
const SERVER_MAX_ROWS = 1000;

interface Row {
  id: string;
  owner_id: string;
  kind: string;
  name: string;
  category: string | null;
  base_points: number;
  cost_per_level: number;
  max_levels: number | null;
  pack: string | null;
  data: Record<string, unknown>;
}

function entry(id: string, name: string, over: Partial<Row> = {}): Row {
  return {
    id,
    owner_id: "user-1",
    kind: "skill",
    name,
    category: null,
    base_points: 1,
    cost_per_level: 0,
    max_levels: null,
    pack: "Core",
    data: {},
    ...over,
  };
}

/**
 * Chainable stand-in for the RLS-scoped client. It applies `eq`, sorts by the
 * requested columns, honours `range`, and — crucially — truncates any response
 * to SERVER_MAX_ROWS exactly like PostgREST does.
 */
function fakeClient(tables: {
  library_entries?: Row[];
  content_packs?: { id: string; owner_id: string; name: string }[];
}) {
  const requests: { from: number; to: number }[] = [];

  const builder = (rows: Record<string, unknown>[]) => {
    let working = [...rows];
    const orders: string[] = [];
    let from = 0;
    let to = Number.MAX_SAFE_INTEGER;

    const self: Record<string, unknown> = {};
    self["select"] = () => self;
    self["eq"] = (column: string, value: unknown) => {
      working = working.filter((row) => row[column] === value);
      return self;
    };
    self["order"] = (column: string) => {
      orders.push(column);
      return self;
    };
    self["limit"] = (count: number) => {
      to = count - 1;
      return self;
    };
    self["range"] = (start: number, end: number) => {
      from = start;
      to = end;
      return self;
    };
    self["then"] = (resolve: (value: { data: unknown; error: null }) => unknown) => {
      const sorted = [...working].sort((a, b) => {
        for (const column of orders) {
          const left = String(a[column] ?? "");
          const right = String(b[column] ?? "");
          if (left !== right) return left < right ? -1 : 1;
        }
        return 0;
      });
      if (orders.length > 0) requests.push({ from, to });
      const page = sorted.slice(from, to + 1).slice(0, SERVER_MAX_ROWS);
      return resolve({ data: page, error: null });
    };
    return self;
  };

  const client = {
    from: (table: string) =>
      builder(
        (table === "library_entries"
          ? (tables.library_entries ?? [])
          : (tables.content_packs ?? [])) as unknown as Record<string, unknown>[],
      ),
  } as unknown as PackClient;

  return { client, requests };
}

const packs = [
  { id: "pack-1", owner_id: "user-1", name: "Core" },
  { id: "pack-2", owner_id: "user-1", name: "Homebrew" },
];

/* ------------------------------------------------------------------ */
/* The original defect: a library larger than one page                 */
/* ------------------------------------------------------------------ */

describe("a visible library larger than one server page stays searchable", () => {
  // 1200 filler names sorting before "S", then the real target.
  const filler = Array.from({ length: 1200 }, (_, index) =>
    entry(`filler-${index}`, `Aaa ${String(index).padStart(4, "0")}`),
  );
  const target = entry("target", "Sobrevivência", { category: "Exploração" });
  const rows = [...filler, target];

  it("finds an entry that sits past the first page", async () => {
    const { client } = fakeClient({ library_entries: rows, content_packs: packs });
    const found = await loadPackCandidates(client, { search: "Sobrevivência", limit: 25 });
    expect(found[0]?.name).toBe("Sobrevivência");
  });

  it("finds it from an unaccented query too", async () => {
    const { client } = fakeClient({ library_entries: rows, content_packs: packs });
    const found = await loadPackCandidates(client, { search: "sobrevivencia", limit: 25 });
    expect(found[0]?.name).toBe("Sobrevivência");
  });

  it("finds an accented library name from an ASCII query and the reverse", async () => {
    const { client } = fakeClient({
      library_entries: [entry("a", "Sobrevivencia"), target],
      content_packs: packs,
    });
    const both = await loadPackCandidates(client, { search: "SOBREVIVÊNCIA", limit: 25 });
    expect(both.map((c) => c.name).sort()).toEqual(["Sobrevivencia", "Sobrevivência"]);
  });

  it("pages the scan instead of asking for more rows than the server returns", async () => {
    const { client, requests } = fakeClient({ library_entries: rows, content_packs: packs });
    await loadPackCandidates(client, { search: "Sobrevivência", limit: 25 });
    expect(requests.length).toBeGreaterThan(1);
    for (const request of requests) {
      expect(request.to - request.from + 1).toBeLessThanOrEqual(SERVER_MAX_ROWS);
    }
  });

  it("scans every visible row rather than a fixed pool", async () => {
    const { client } = fakeClient({ library_entries: rows, content_packs: packs });
    const scan = await loadPackCandidatesDetailed(client, { search: "Sobrevivência", limit: 25 });
    expect(scan.scanned).toBe(rows.length);
    expect(scan.truncated).toBe(false);
  });

  it("matches a character entry against a definition past the first page", async () => {
    const { client } = fakeClient({ library_entries: rows, content_packs: packs });
    const match = await findPackMatch(client, { kind: "skill", name: "Sobrevivência" });
    expect(match.status).toBe("unique");
    expect(match.item?.name).toBe("Sobrevivência");
  });
});

/* ------------------------------------------------------------------ */
/* Everything visible in the listing is searchable                     */
/* ------------------------------------------------------------------ */

describe("visible rows and searchable rows agree", () => {
  const rows = [
    entry("s1", "Sobrevivência", { category: "Exploração" }),
    entry("s2", "Sobrevivência Urbana"),
    entry("s3", "Furtividade", { pack: "Homebrew" }),
    entry("s4", "Espada Curta", { kind: "equipment", pack: "Homebrew" }),
  ];
  const build = () => fakeClient({ library_entries: rows, content_packs: packs }).client;

  it("searches every visible pack entry when no campaign is given", async () => {
    const found = await loadPackCandidates(build(), { search: "Sobrevivência", limit: 25 });
    expect(found.map((c) => c.name)).toEqual(["Sobrevivência", "Sobrevivência Urbana"]);
  });

  it("enforces the campaign allow list only when a campaign is given", async () => {
    const allowed = await loadPackCandidates(build(), {
      search: "Furtividade",
      campaignSettings: { allowed_packs: ["Core"] },
      limit: 25,
    });
    expect(allowed).toEqual([]);

    const permitted = await loadPackCandidates(build(), {
      search: "Furtividade",
      campaignSettings: { allowed_packs: ["Homebrew"] },
      limit: 25,
    });
    expect(permitted.map((c) => c.name)).toEqual(["Furtividade"]);

    const noList = await loadPackCandidates(build(), {
      search: "Furtividade",
      campaignSettings: { allowed_packs: [] },
      limit: 25,
    });
    expect(noList.map((c) => c.name)).toEqual(["Furtividade"]);
  });

  it("composes the kind filter with the text search", async () => {
    const skills = await loadPackCandidates(build(), {
      search: "Espada",
      kind: "skill",
      limit: 25,
    });
    expect(skills).toEqual([]);
    const gear = await loadPackCandidates(build(), {
      search: "Espada",
      kind: "equipment",
      limit: 25,
    });
    expect(gear.map((c) => c.name)).toEqual(["Espada Curta"]);
  });

  it("composes the pack filter with the text search", async () => {
    const core = await loadPackCandidates(build(), {
      search: "Furtividade",
      packId: "pack-1",
      limit: 25,
    });
    expect(core).toEqual([]);
    const homebrew = await loadPackCandidates(build(), {
      search: "Furtividade",
      packId: "pack-2",
      limit: 25,
    });
    expect(homebrew.map((c) => c.name)).toEqual(["Furtividade"]);
  });

  it("returns the pack identity and definition fields needed for linking", async () => {
    const [found] = await loadPackCandidates(build(), { search: "Sobrevivência", limit: 1 });
    expect(found?.pack_id).toBe("pack-1");
    expect(found?.pack_name).toBe("Core");
    expect(found?.category).toBe("Exploração");
    expect(found?.base_points).toBe(1);
  });

  it("is deterministic and capped by limit while reporting the true match count", async () => {
    const first = await loadPackCandidatesDetailed(build(), {
      search: "Sobrevivência",
      limit: 1,
    });
    const second = await loadPackCandidatesDetailed(build(), {
      search: "Sobrevivência",
      limit: 1,
    });
    expect(first.candidates.map((c) => c.id)).toEqual(second.candidates.map((c) => c.id));
    expect(first.candidates).toHaveLength(1);
    expect(first.matched).toBe(2);
  });
});

/* ------------------------------------------------------------------ */
/* P0-04: scan truncation is reported, never silently swallowed         */
/* ------------------------------------------------------------------ */

describe("a scan that hits the row cap reports truncation instead of a false empty result", () => {
  // Just over one server page (1000 rows) so the loop must start a second
  // page — where an injected `maxScanRows` cap (well below 50000) can stop
  // it before the alphabetically-last target is ever read.
  const filler = Array.from({ length: 1005 }, (_, index) =>
    entry(`filler-${index}`, `Aaa ${String(index).padStart(4, "0")}`),
  );
  const target = entry("target", "Zzyzx Skill");
  const rows = [...filler, target];

  it("marks the scan truncated and keeps the match count partial when the cap is hit", async () => {
    const { client } = fakeClient({ library_entries: rows, content_packs: packs });
    const scan = await loadPackCandidatesDetailed(client, {
      search: "Zzyzx",
      limit: 25,
      maxScanRows: 1000,
    });
    expect(scan.truncated).toBe(true);
    expect(scan.candidates).toEqual([]);
    expect(scan.matched).toBe(0);
  });

  it("distinguishes 'no match, search complete' from 'no match, search incomplete'", async () => {
    const { client } = fakeClient({ library_entries: rows, content_packs: packs });

    const incomplete = await loadPackCandidatesDetailed(client, {
      search: "Zzyzx",
      limit: 25,
      maxScanRows: 1000,
    });
    expect(incomplete.matched).toBe(0);
    expect(incomplete.truncated).toBe(true);

    const complete = await loadPackCandidatesDetailed(client, {
      search: "Not In The Library At All",
      limit: 25,
    });
    expect(complete.matched).toBe(0);
    expect(complete.truncated).toBe(false);
  });
});
