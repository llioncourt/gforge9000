/**
 * Canonical text normalisation.
 *
 * One implementation for every name/alias comparison in the app (trait
 * matching, adaptation scanning, asset resolution). Having three near-identical
 * copies meant a Unicode fix in one silently missed the others.
 *
 * Classification: CONFIGURABLE (string handling, not a game rule).
 */

/** Removes diacritics without touching case, spacing or punctuation. */
export function foldAccents(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/**
 * The canonical comparison form: accent-folded, lower-cased, every run of
 * non-alphanumeric characters collapsed to a single space, trimmed.
 * "Área  de Conhecimento — Nadrel!" and "Area de conhecimento Nadrel"
 * both become "area de conhecimento nadrel".
 */
export function normalizeText(value: string): string {
  return foldAccents(value)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

/** Lowercase slug form used for stable keys: "guns-pistol". */
export function slugifyText(value: string): string {
  return normalizeText(value).replace(/\s+/g, "-");
}
