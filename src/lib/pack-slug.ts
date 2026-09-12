export const UNPACKED_SLUG = "__personal";

/** URL slug for a pack name; personal (unpacked) content has a reserved slug. */
export function packSlug(pack: string | null): string {
  return pack === null ? UNPACKED_SLUG : encodeURIComponent(pack);
}

export function packFromSlug(slug: string): string | null {
  return slug === UNPACKED_SLUG ? null : decodeURIComponent(slug);
}
