// @vitest-environment jsdom
/**
 * REQ-FIX-007 / test 12 — real component coverage for the pack picker.
 *
 * The other pack-link tests exercise pure helpers. This one renders the actual
 * `PackLinkPicker`, types a search, clicks a real result and asserts that the
 * write that reaches the database carries `source.link` with
 * `link_method: "ui_picker"` while preserving the entry's other provenance.
 * It also proves the campaign allow list is honoured by the same shared code
 * path the backend uses: a pack outside the whitelist is never offered.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/* ---------- module doubles (everything else is the real thing) ---------- */

vi.mock("@/i18n/hooks", () => ({
  useT: () => ({ t: (key: string) => key }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const updates: Record<string, unknown>[] = [];

type Row = Record<string, unknown>;

const packs: Row[] = [
  { id: "pack-core", owner_id: "u1", name: "Core" },
  { id: "pack-third", owner_id: "u1", name: "Third Party" },
];

const library: Row[] = [
  {
    id: "lib-1",
    owner_id: "u1",
    kind: "skill",
    name: "Sobrevivência",
    category: "Outdoor",
    base_points: 1,
    cost_per_level: 0,
    max_levels: null,
    pack: "Core",
    data: { attribute: "PER", difficulty: "A", defaults: "PER-5" },
  },
  {
    id: "lib-2",
    owner_id: "u1",
    kind: "skill",
    name: "Sobrevivencia Avancada",
    category: "Outdoor",
    base_points: 1,
    cost_per_level: 0,
    max_levels: null,
    pack: "Third Party",
    data: { attribute: "PER", difficulty: "H" },
  },
];

const entryRow: Row = {
  id: "entry-1",
  character_id: "char-1",
  kind: "skill",
  name: "Sobrevivencia",
  category: null,
  points: 2,
  levels: 1,
  data: {},
  notes: null,
  source: { label: "Basic Set", page: "B222", house_key: { deep: true } },
  sort_order: 0,
};

function tableRows(table: string): Row[] {
  if (table === "content_packs") return packs;
  if (table === "library_entries") return library;
  if (table === "character_entries") return [entryRow];
  return [];
}

/** Minimal chainable stand-in for the caller's RLS-scoped client. */
function makeClient() {
  const from = (table: string) => {
    let rows = tableRows(table).slice();
    const builder: Record<string, unknown> = {
      select: () => builder,
      order: () => builder,
      eq: (col: string, value: unknown) => {
        if (table === "character_entries") return builder;
        rows = rows.filter((r) => r[col] === value);
        return builder;
      },
      in: (col: string, values: unknown[]) => {
        rows = rows.filter((r) => values.includes(r[col]));
        return builder;
      },
      range: (start: number, end: number) => {
        rows = rows.slice(start, end + 1);
        return builder;
      },
      update: (patch: Record<string, unknown>) => {
        updates.push(patch);
        Object.assign(entryRow, patch);
        rows = [entryRow];
        return builder;
      },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: { data: Row[]; error: null }) => unknown) =>
        resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return { from };
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: makeClient(),
}));

const { PackLinkPicker } = await import("@/components/character/pack-link");

function renderPicker(campaignSettings: unknown) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    createElement(
      QueryClientProvider,
      { client },
      createElement(PackLinkPicker, {
        open: true,
        onOpenChange: () => undefined,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double for a row
        entry: { ...entryRow } as any,
        campaignSettings,
        onLinked: () => undefined,
      }),
    ),
  );
}

afterEach(() => {
  cleanup();
  updates.length = 0;
});

describe("PackLinkPicker (component)", () => {
  it("links the clicked pack item with link_method 'ui_picker' and keeps provenance", async () => {
    const user = userEvent.setup();
    renderPicker({ allowed_packs: [] });

    const box = await screen.findByRole("textbox");
    await user.clear(box);
    await user.type(box, "sobrevivencia");

    const option = await screen.findByRole("button", { name: /Sobrevivência\s*Core/ });
    await user.click(option);

    await waitFor(() => expect(updates.length).toBeGreaterThan(0));
    const patch = updates.find((p) => "source" in p);
    const source = patch?.["source"] as Record<string, unknown>;
    expect(source["label"]).toBe("Basic Set");
    expect(source["page"]).toBe("B222");
    expect(source["house_key"]).toEqual({ deep: true });
    const link = source["link"] as Record<string, unknown>;
    expect(link["link_method"]).toBe("ui_picker");
    expect(link["pack_entry_id"]).toBe("lib-1");
    expect(link["pack_name"]).toBe("Core");
    expect(String(link["pack_version"])).toMatch(/^v1:sha256:[0-9a-f]{64}$/);
  });

  it("never offers an item from a pack the campaign does not allow", async () => {
    const user = userEvent.setup();
    renderPicker({ allowed_packs: ["Core"] });

    const box = await screen.findByRole("textbox");
    await user.clear(box);
    await user.type(box, "sobrevivencia");

    await screen.findByRole("button", { name: /Sobrevivência\s*Core/ });
    expect(screen.queryByText("Sobrevivencia Avancada")).toBeNull();
  });
});
