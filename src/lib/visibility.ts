/**
 * Single source of truth for entity/relationship visibility.
 *
 * The database RLS policies only understand the canonical values below. Legacy
 * data (and the ZIP package format) used lowercase words like "gm"/"players";
 * everything funnels through `normalizeVisibility` so those can never leak into
 * a write again.
 */

export const VISIBILITY_VALUES = [
  "GM_ONLY",
  "UNREVEALED",
  "SELECTED_PLAYERS",
  "ALL_PLAYERS",
  "PUBLIC",
] as const;

export type VisibilityValue = (typeof VISIBILITY_VALUES)[number];

export const VISIBILITY_LABELS: Record<VisibilityValue, string> = {
  GM_ONLY: "GM only",
  UNREVEALED: "Unrevealed",
  SELECTED_PLAYERS: "Selected players",
  ALL_PLAYERS: "All players",
  PUBLIC: "Public",
};

export const VISIBILITY_OPTIONS = VISIBILITY_VALUES.map((value) => ({
  value,
  label: VISIBILITY_LABELS[value],
}));

const ALIASES: Record<string, VisibilityValue> = {
  GM: "GM_ONLY",
  GM_ONLY: "GM_ONLY",
  GMONLY: "GM_ONLY",
  PRIVATE: "GM_ONLY",
  SECRET: "GM_ONLY",
  HIDDEN: "GM_ONLY",
  UNREVEALED: "UNREVEALED",
  SELECTED: "SELECTED_PLAYERS",
  SELECTED_PLAYERS: "SELECTED_PLAYERS",
  PLAYERS: "ALL_PLAYERS",
  ALL_PLAYERS: "ALL_PLAYERS",
  SHARED: "ALL_PLAYERS",
  CAMPAIGN: "ALL_PLAYERS",
  PUBLIC: "PUBLIC",
};

/** Maps any stored/imported value (legacy or canonical) onto a canonical value. */
export function normalizeVisibility(value: string | boolean | null | undefined): VisibilityValue {
  if (typeof value === "boolean") return value ? "ALL_PLAYERS" : "GM_ONLY";
  const key = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  return ALIASES[key] ?? "GM_ONLY";
}

/** True when every campaign member can read the record without a grant. */
export function isPlayerVisible(value: string | boolean | null | undefined): boolean {
  const normalized = normalizeVisibility(value);
  return normalized === "ALL_PLAYERS" || normalized === "PUBLIC";
}

/** True when the record is only readable by the GM (grants have no effect yet). */
export function isGmOnly(value: string | boolean | null | undefined): boolean {
  const normalized = normalizeVisibility(value);
  return normalized === "GM_ONLY" || normalized === "UNREVEALED";
}

/**
 * Visibility a record must move to so a per-player reveal actually takes effect.
 * Returns null when no change is needed.
 */
export function visibilityForReveal(
  current: string | boolean | null | undefined,
): VisibilityValue | null {
  return isGmOnly(current) ? "SELECTED_PLAYERS" : null;
}

export function visibilityLabel(value: string | boolean | null | undefined): string {
  return VISIBILITY_LABELS[normalizeVisibility(value)];
}

/** Friendly wording used by the exported ZIP package format. */
export function toPackageVisibility(
  value: string | boolean | null | undefined,
): "gm" | "players" | "public" {
  const normalized = normalizeVisibility(value);
  if (normalized === "PUBLIC") return "public";
  if (normalized === "ALL_PLAYERS") return "players";
  return "gm";
}
