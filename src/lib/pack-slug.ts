/** URL slug for a pack name. Every library entry belongs to a pack. */
export function packSlug(pack: string): string {
  return encodeURIComponent(pack);
}

export function packFromSlug(slug: string): string {
  return decodeURIComponent(slug);
}
