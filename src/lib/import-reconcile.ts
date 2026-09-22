/**
 * Glue between a character import and the trait reconciliation helpers.
 * Everything here is best effort: if the library cannot be read or the AI
 * pass fails, the import continues silently with the entries as written.
 */
import { listLibraryFull } from "@/lib/api";
import { matchImportedTraits } from "@/lib/trait-match.functions";
import {
  buildCatalogue,
  candidatesFor,
  catalogueIndex,
  reconcileEntries,
  resolveMatches,
  unmatchedItems,
  type CatalogueEntry,
  type ImportedEntry,
  type ReconcileResult,
} from "@/lib/trait-match";

export async function reconcileImportedEntries(
  entries: ImportedEntry[],
  allowedPacks: string[] = [],
): Promise<ReconcileResult> {
  let rows: CatalogueEntry[] = [];
  try {
    rows = (await listLibraryFull()) as unknown as CatalogueEntry[];
  } catch {
    return { entries, matched: 0, unmatched: 0 };
  }

  const catalogue = buildCatalogue(rows, allowedPacks);
  if (catalogue.length === 0) return { entries, matched: 0, unmatched: 0 };
  const index = catalogueIndex(catalogue);

  const pending = unmatchedItems(entries, index).slice(0, 80);
  let aiMatches = new Map<string, CatalogueEntry>();
  if (pending.length > 0) {
    const candidates = candidatesFor(catalogue, pending);
    if (candidates.length > 0) {
      try {
        const resolutions = await matchImportedTraits({ data: { items: pending, candidates } });
        aiMatches = resolveMatches(resolutions, index);
      } catch {
        // Silent: unmatched traits are simply kept as imported.
      }
    }
  }

  return reconcileEntries(entries, index, aiMatches);
}
