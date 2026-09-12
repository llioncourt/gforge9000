/**
 * Campaign content-pack gating (pure helpers).
 *
 * Rule: a campaign may list allowed content packs in its settings.
 * - Empty list  -> every pack is allowed.
 * - Non-empty   -> only the listed packs are allowed.
 * - Entries with no pack are personal/user content and are always allowed;
 *   pack gating only restricts named content packs.
 */

export function allowedPacksOf(settings: unknown): string[] {
  if (!settings || typeof settings !== "object") return [];
  const raw = (settings as Record<string, unknown>)["allowed_packs"];
  if (!Array.isArray(raw)) return [];
  return raw.map((p) => String(p).trim()).filter(Boolean);
}

export function isPackAllowed(pack: string | null | undefined, allowed: string[]): boolean {
  if (allowed.length === 0) return true;
  const name = (pack ?? "").trim();
  if (!name) return true;
  return allowed.some((a) => a.toLowerCase() === name.toLowerCase());
}

export function packGateReason(
  pack: string | null | undefined,
  allowed: string[],
): string | null {
  if (isPackAllowed(pack, allowed)) return null;
  return `Pack “${(pack ?? "").trim()}” is not enabled for this campaign.`;
}
