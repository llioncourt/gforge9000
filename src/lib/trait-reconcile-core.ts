/**
 * Deterministic trait reconciliation against a caller-scoped library.
 *
 * `src/lib/import-reconcile.ts` is the browser flavour: it reads the library
 * through the browser API layer and adds a best-effort AI pass for translated
 * names. This module is the same reconciliation without either of those
 * browser-only pieces, so the server-safe importers (campaign packages) can
 * canonicalise entries exactly the way the browser importer does instead of
 * writing raw, provenance-less rows.
 *
 * Reads use the caller's own RLS-scoped client; nothing here widens access.
 *
 * Classification: CONFIGURABLE (name reconciliation, not a game rule).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  buildCatalogue,
  catalogueIndex,
  reconcileEntries,
  type CatalogueEntry,
  type ImportedEntry,
  type ReconcileResult,
} from "@/lib/trait-match";

const CATALOGUE_COLUMNS =
  "kind,name,category,base_points,cost_per_level,summary,data,pack," +
  "source_label,source_edition,source_page,source_type";

const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;

/** Library rows the caller may read, paged so a big library still loads. */
async function loadCatalogue(client: SupabaseClient<Database>): Promise<CatalogueEntry[]> {
  const rows: CatalogueEntry[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("library_entries")
      .select(CATALOGUE_COLUMNS)
      .order("name")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as unknown as CatalogueEntry[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * Rewrites imported entries onto the caller's own library content where the
 * deterministic matcher is certain. Anything unmatched — and every entry when
 * the library cannot be read — is kept exactly as imported, provenance
 * included; the import never fails because of reconciliation.
 */
export async function reconcileEntriesWithClient(
  client: SupabaseClient<Database>,
  entries: ImportedEntry[],
  allowedPacks: string[] = [],
): Promise<ReconcileResult> {
  if (entries.length === 0) return { entries, matched: 0, unmatched: 0 };
  let rows: CatalogueEntry[];
  try {
    rows = await loadCatalogue(client);
  } catch {
    return { entries, matched: 0, unmatched: entries.length };
  }
  const catalogue = buildCatalogue(rows, allowedPacks);
  if (catalogue.length === 0) return { entries, matched: 0, unmatched: entries.length };
  return reconcileEntries(entries, catalogueIndex(catalogue));
}
