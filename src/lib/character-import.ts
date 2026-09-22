/**
 * Character import coordinator.
 *
 * Three guarantees, each of which used to be missing:
 *  - idempotent: a file carries a stable import key, so importing it again
 *    replaces the sheet it produced before instead of creating a twin;
 *  - all-or-nothing: entries are written in one statement, and a failure after
 *    the sheet row exists removes that row again;
 *  - loud: if the clean-up itself fails, the caller is told so explicitly
 *    rather than seeing only the original error.
 *
 * The coordinator takes its database operations as arguments so the whole
 * sequence, including every failure path, is unit testable.
 */
import { characterImportKey, type CharacterIdentitySource } from "@/lib/import-identity";
import type { PortableCharacter } from "@/lib/portable";
import type { ImportedEntry } from "@/lib/trait-match";

export interface CharacterImportDeps {
  findByImportKey: (key: string) => Promise<{ id: string } | null>;
  createCharacter: (input: Record<string, unknown>) => Promise<{ id: string; name: string }>;
  updateCharacter: (
    id: string,
    patch: Record<string, unknown>,
  ) => Promise<{ id: string; name: string }>;
  deleteCharacter: (id: string) => Promise<void>;
  deleteEntriesOf: (characterId: string) => Promise<void>;
  addEntries: (characterId: string, entries: ImportedEntry[]) => Promise<void>;
  reconcile: (entries: ImportedEntry[]) => Promise<{ entries: ImportedEntry[] }>;
}

export interface CharacterImportResult {
  id: string;
  name: string;
  entries: number;
  /** True when an earlier import of the same file was replaced. */
  replaced: boolean;
}

export class ImportRollbackError extends Error {
  readonly importError: unknown;
  readonly rollbackCause: unknown;
  readonly characterId: string;

  constructor(importError: unknown, rollbackCause: unknown, characterId: string) {
    super(
      "The character could not be imported, and the incomplete sheet could not be removed automatically. Delete it from your character list and try again.",
    );
    this.name = "ImportRollbackError";
    this.importError = importError;
    this.rollbackCause = rollbackCause;
    this.characterId = characterId;
  }
}

export async function runCharacterImport(
  file: PortableCharacter,
  deps: CharacterImportDeps,
  report: (stage: "matching" | "saving", done?: number, total?: number) => void = () => {},
): Promise<CharacterImportResult> {
  const importKey = characterImportKey(file as unknown as CharacterIdentitySource);
  const { id: _ignored, ...character } = file.character as unknown as Record<string, unknown>;
  const payload = { ...character, import_key: importKey };

  const existing = await deps.findByImportKey(importKey);
  const row = existing
    ? await deps.updateCharacter(existing.id, payload)
    : await deps.createCharacter(payload);

  try {
    report("matching");
    const { entries: reconciled } = await deps.reconcile(
      file.entries as unknown as ImportedEntry[],
    );
    // Imported sheets keep the order they arrived in: positions are assigned
    // 0,1,2,… after reconciliation and before anything is written.
    const entries = reconciled.map((entry, index) => ({ ...entry, sort_order: index }));
    report("saving", 0, entries.length);
    if (existing) await deps.deleteEntriesOf(row.id);
    await deps.addEntries(row.id, entries);
    report("saving", entries.length, entries.length);
    return { id: row.id, name: row.name, entries: entries.length, replaced: !!existing };
  } catch (error) {
    // A sheet this import created must not survive a failure. A sheet that
    // already existed is left alone — deleting the user's data would be worse
    // than an incomplete refresh.
    if (!existing) {
      try {
        await deps.deleteCharacter(row.id);
      } catch (rollbackError) {
        throw new ImportRollbackError(error, rollbackError, row.id);
      }
    }
    throw error;
  }
}
